/* JKL Cartridge Webapp
 * Copyright (C) 2023 Sebastian Quilitz
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import StringView from "stringview"

// How long any single step of opening the device may take before the attempt is
// abandoned. Without this a step that never settles leaves the app on the
// connecting screen with no way forward.
const OPEN_TIMEOUT_MS = 15000;

function withTimeout(promise, what) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(what + " timed out after " + (OPEN_TIMEOUT_MS / 1000) + "s"));
        }, OPEN_TIMEOUT_MS);

        promise.then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); }
        );
    });
}

class Communication {
    static FILTERS = [
        { 'vendorId': 0x2E8A, 'productId': 0x107F }, // TinyUSB example
        { 'vendorId': 0xcafe, 'productId': 0x2142 }, // TinyUSB example
    ];

    constructor() {
        this.featureStep = 0;
        this.supportsSpeedChangeBankInfo = false;
        this.supportsMbcInfo = false;
    }

    // Only devices the browser has already been granted are visible here. An
    // unpaired one cannot be seen at all, by design, which is why "prompt only
    // when a new cartridge appears" cannot be detected and has to be a choice
    // the user makes.
    static grantedPort() {
        return navigator.usb.getDevices().then((devices) => {
            return devices.find((d) =>
                Communication.FILTERS.some((f) =>
                    d.vendorId === f.vendorId && d.productId === f.productId)) || null;
        }).catch(() => null);
    }

    static requestPort() {
        return navigator.usb.requestDevice({ 'filters': Communication.FILTERS }).then(
            device => {
                return device;
            }
        );
    }

    getEndpoints(interfaces) {
        interfaces.forEach(element => {
            var alternates = element.alternates;
            alternates.forEach(elementalt => {
                if (elementalt.interfaceClass === 0xFF) {
                    console.log("Interface number:");
                    console.log(element.interfaceNumber);
                    this.ifNum = element.interfaceNumber;
                    elementalt.endpoints.forEach(elementendpoint => {
                        if (elementendpoint.direction === "out") {
                            console.log("Endpoint out: ");
                            console.log(elementendpoint.endpointNumber);
                            this.epOut = elementendpoint.endpointNumber;
                        }

                        if (elementendpoint.direction === "in") {
                            console.log("Endpoint in: ");
                            console.log(elementendpoint.endpointNumber);
                            this.epIn = elementendpoint.endpointNumber;
                        }
                    });
                }
            })
        })
    }

    // Opens a cartridge the browser already knows without asking again, which
    // is the ordinary case. Pass choose to insist on the chooser, which is the
    // only way to reach a cartridge that has never been paired. Every step is
    // bounded, because a step that hangs used to strand the app on the
    // connecting screen with no way forward.
    getDevice({ choose = false } = {}) {
        this.ready = false;

        const pick = choose
            ? Communication.requestPort()
            : Communication.grantedPort().then((granted) => granted || Communication.requestPort());

        let device = null;

        return pick.then((dev) => {
            console.log("Opening device...");
            device = dev;
            this.device = device;
            return withTimeout(dev.opened ? Promise.resolve() : dev.open(), "Opening the device");
        }).then(() => {
            console.log("Selecting configuration");
            if (device.configuration && device.configuration.configurationValue === 1) {
                return undefined;
            }
            return withTimeout(device.selectConfiguration(1), "Selecting the configuration");
        }).then(() => {
            console.log("Getting endpoints");
            this.getEndpoints(device.configuration.interfaces);
            if (this.ifNum === undefined) {
                throw new Error("No vendor interface on this device");
            }
            return undefined;
        }).then(() => {
            console.log("Claiming interface");
            return withTimeout(device.claimInterface(this.ifNum), "Claiming the interface");
        }).then(() => {
            console.log("Select alt interface");
            return withTimeout(device.selectAlternateInterface(this.ifNum, 0), "Selecting the interface");
        }).then(() => {
            console.log("Control Transfer Out");
            return withTimeout(device.controlTransferOut({
                'requestType': 'class',
                'recipient': 'interface',
                'request': 0x22,
                'value': 0x01,
                'index': this.ifNum
            }), "Opening the channel");
        }).then(() => {
            console.log("Ready!");
            this.ready = true;
            this.device = device;
        });
    }

    executeCommand(command, payload, readBytes = 0) {
        return new Promise((resolve, reject) => {
            // Sized up front. Using a resizable ArrayBuffer here required
            // Chrome 111, raising this app's floor far above WebUSB's own, and
            // it is no simpler than allocating the right size to begin with.
            var hasPayload = payload instanceof Uint8Array;
            var requestData = new Uint8Array(hasPayload ? payload.byteLength + 1 : 1);
            requestData[0] = command;
            if (hasPayload) {
                requestData.set(payload, 1);
            }
            // Awaited before reading, so a failed transfer rejects this command
            // rather than escaping as an unhandled rejection and leaving the
            // read to time out with a misleading error.
            this.send(requestData).then(() => {
                return this.read(readBytes + 1);
            }).then(result => {
                if (result.status !== "ok") {
                    console.log("Transfer error status=" + result.status);
                    reject("Error reading from device status=" + result.status);
                    return;
                }

                var data = new DataView(result.data.buffer);
                console.log("executeCommand read " + data.getUint8(0) + " " + data.byteLength);
                if (data.getUint8(0) !== command) {
                    reject("Wrong answer");
                    return;
                }

                resolve(result.data.buffer.slice(1));
            },
                error => {
                    reject(error);
                });
        });
    }


    read(num) {
        return new Promise((resolve, reject) => {
            this.device.transferIn(this.epIn, num).then(result => {
                resolve(result);
            },
                error => {
                    console.log("Error");
                    console.log(error);
                    reject(error);
                });
        });
    }

    send(data) {
        var buffer = new ArrayBuffer(data.byteLength);
        var view = new Uint8Array(buffer);
        view.set(data, 0);
        return this.device.transferOut(this.epOut, buffer);
    }

    // Releases the USB device. Safe to call more than once, and on a device
    // that has already gone away, so it can be used from a disconnect handler.
    async close() {
        const device = this.device;
        this.device = null;
        this.ready = false;

        if (!device) {
            return;
        }

        try {
            await device.releaseInterface(this.ifNum);
        }
        catch (e) {
            console.log("Releasing the interface failed: " + e);
        }

        try {
            await device.close();
        }
        catch (e) {
            console.log("Closing the device failed: " + e);
        }
    }

    // Returned when the device info cannot be read or parsed. This command is
    // documented as never rejecting.
    // Returned when the device info could not be read. `unknown` marks it as
    // "we don't know" rather than "version 0.0.0", which would otherwise read
    // as older than any minimum and trigger a spurious upgrade prompt.
    static defaultDeviceInfo() {
        return {
            unknown: true,
            featureStep: 0,
            hwVersion: 1,
            swVersion: {
                major: 0,
                minor: 0,
                patch: 0,
                buildType: "E",
                gitShort: 0,
                gitDirty: false
            },
        };
    }

    readBuildNameCommand() {
        return new Promise((resolve, reject) => {
            // Command 12 only exists on firmware 1.0.1 and newer; older
            // cartridges answer 0xFF and executeCommand rejects.
            this.executeCommand(12, null, 12).then(result => {
                try {
                    const bytes = new Uint8Array(result);
                    const end = bytes.indexOf(0);
                    const name = new TextDecoder("utf-8")
                        .decode(bytes.slice(0, end === -1 ? bytes.length : end));
                    resolve(name);
                }
                catch (e) {
                    reject(e);
                }
            }, error => reject(error));
        });
    }

    readDeviceInfoCommand() {
        return new Promise((resolve, reject) => {
            this.executeCommand(254, null, 11).then(result => {
                try {
                    var view = new DataView(result);
                    var res = {
                        featureStep: view.getUint8(0),
                        hwVersion: view.getUint8(1),
                        swVersion: {
                            major: view.getUint8(2),
                            minor: view.getUint8(3),
                            patch: view.getUint8(4),
                            buildType: StringView.getString(view, 5, 1),
                            gitShort: view.getUint32(6),
                            gitDirty: view.getUint8(10) === 1 ? true : false
                        },
                    };

                    this.featureStep = res.featureStep;

                    if (this.featureStep >= 2) {
                        this.supportsSpeedChangeBankInfo = true;
                    }

                    if (this.featureStep >= 3) {
                        this.supportsMbcInfo = true;
                    }

                    resolve(res);
                }
                catch (e) {
                    // Callers read this result without guarding, so a parse
                    // failure falls back exactly as a transfer failure does
                    // rather than leaving the promise unsettled.
                    console.log("readDeviceInfoCommand() could not parse: " + e);
                    resolve(Communication.defaultDeviceInfo());
                }
            },
                error => {
                    console.log("readDeviceInfoCommand() " + error)
                    resolve(Communication.defaultDeviceInfo());
                });
        });
    }

    readDeviceSerialId() {
        return new Promise((resolve, reject) => {
            this.executeCommand(253, null, 8).then(result => {
                var view = new Uint8Array(result);
                var res = Array.from(view, function (byte) {
                    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
                }).join('').toUpperCase();

                resolve(res);
            },
                error => {
                    reject(error);
                });
        });
    }

    readRomUtilizationCommand() {
        return new Promise((resolve, reject) => {
            this.executeCommand(1, null, 5).then(result => {
                try {
                    var view = new DataView(result);
                    var res = {
                        numRoms: view.getUint8(0),
                        usedBanks: view.getUint16(1),
                        maxBanks: view.getUint16(3)
                    };
                    resolve(res);
                }
                catch (e) {
                    reject("Could not parse rom utilization: " + e);
                }
            },
                error => {
                    reject(error);
                });
        });
    }

    requestRomUploadCommand(banks, name, speedChangeBank) {
        return new Promise((resolve, reject) => {
            const enc = new TextEncoder("utf-8");
            var payload;
            if (this.supportsSpeedChangeBankInfo) {
                payload = new ArrayBuffer(21);
            }
            else {
                payload = new ArrayBuffer(19);
            }
            var view = new DataView(payload);
            var arrayView = new Uint8Array(payload);
            view.setUint16(0, banks, false);
            arrayView.fill(0, 2, 19);
            arrayView.set(enc.encode(name), 2);
            if (this.supportsSpeedChangeBankInfo) {
                view.setUint16(19, speedChangeBank);
            }

            this.executeCommand(2, arrayView, 1).then(result => {
                var data = new Uint8Array(result);
                if (data[0] !== 0) {
                    console.log("requestRomUploadCommand rejected with code " + data[0]);
                    reject("Rom not accepted");
                    return;
                }

                resolve();
            },
                error => {
                    reject(error);
                });
        });
    }

    sendRomChunkCommand(bank, chunk, data) {
        return new Promise((resolve, reject) => {
            var payload = new ArrayBuffer(36);
            var view = new DataView(payload);
            var arrayView = new Uint8Array(payload);
            view.setUint16(0, bank, false);
            view.setUint16(2, chunk, false);
            arrayView.set(data, 4);
            this.executeCommand(3, arrayView, 1).then(result => {
                var data = new Uint8Array(result);
                if (data[0] !== 0) {
                    console.log("sendRomChunkCommand rejected with code " + data[0]);
                    reject("Rom chunk not accepted");
                    return;
                }

                resolve();
            },
                error => {
                    reject(error);
                });
        });
    }

    readRomInfoCommand(rom) {
        return new Promise((resolve, reject) => {
            var payload = new ArrayBuffer(1);
            var view = new DataView(payload);
            var arrayView = new Uint8Array(payload);
            view.setUint8(0, rom);
            var receiveLength = 21;
            if (!this.supportsMbcInfo) {
                receiveLength = 20;
            }
            this.executeCommand(4, arrayView, receiveLength).then(result => {
                // A throw in here would otherwise leave the outer promise
                // unsettled, hanging every caller that awaits it.
                try {
                    var view = new DataView(result);
                    var romInfo = {
                        romId: rom,
                        name: StringView.getStringNT(view, 0),
                        numRamBanks: view.getUint8(17),
                        mbc: this.supportsMbcInfo ? view.getUint8(18) : 0xFF,
                        numRomBanks: view.byteLength >= 21 ? view.getUint16(19) : 0
                    };
                    resolve(romInfo);
                }
                catch (e) {
                    reject("Could not parse rom info: " + e);
                }
            },
                error => {
                    reject(error);
                });
        });
    }

    deleteRomCommand(romId) {
        return new Promise((resolve, reject) => {
            var payload = new ArrayBuffer(1);
            var view = new DataView(payload);
            var arrayView = new Uint8Array(payload);
            view.setUint8(0, romId);
            this.executeCommand(5, arrayView, 2).then(result => {
                var data = new Uint8Array(result);
                if (data[0] !== 0) {
                    console.log("deleteRomCommand rejected with code " + data[0]);
                    reject("Delete failed");
                    return;
                }

                resolve();
            },
                error => {
                    reject(error);
                });
        });
    }

    requestSaveGameDownloadCommand(romId) {
        return new Promise((resolve, reject) => {
            var payload = new ArrayBuffer(1);
            var view = new DataView(payload);
            var arrayView = new Uint8Array(payload);
            view.setUint8(0, romId);
            this.executeCommand(6, arrayView, 2).then(result => {
                var data = new Uint8Array(result);
                if (data[0] !== 0) {
                    console.log("requestSaveGameCommand rejected with code " + data[0]);
                    reject("Request Savegame failed");
                    return;
                }

                resolve();
            },
                error => {
                    reject(error);
                });
        });
    }

    receiveSavegameChunkCommand() {
        return new Promise((resolve, reject) => {
            this.executeCommand(7, null, 36).then(result => {
                try {
                    var view = new DataView(result);
                    var data = new Uint8Array(result);
                    var res = {
                        bank: view.getUint16(0),
                        chunk: view.getUint16(2),
                        data: data.subarray(4, 36)
                    };

                    resolve(res);
                }
                catch (e) {
                    reject("Could not parse savegame chunk: " + e);
                }
            },
                error => {
                    reject(error);
                });
        });
    }

    requestSaveGameUploadCommand(romId) {
        return new Promise((resolve, reject) => {
            var payload = new ArrayBuffer(1);
            var view = new DataView(payload);
            var arrayView = new Uint8Array(payload);
            view.setUint8(0, romId);

            this.executeCommand(8, arrayView, 1).then(result => {
                var data = new Uint8Array(result);
                if (data[0] !== 0) {
                    console.log("requestSaveGameUploadCommand rejected with code " + data[0]);
                    reject("Savegame not accepted");
                    return;
                }

                resolve();
            },
                error => {
                    reject(error);
                });
        });
    }

    sendSavegameChunkCommand(bank, chunk, data) {
        return new Promise((resolve, reject) => {
            var payload = new ArrayBuffer(36);
            var view = new DataView(payload);
            var arrayView = new Uint8Array(payload);
            view.setUint16(0, bank, false);
            view.setUint16(2, chunk, false);
            arrayView.set(data, 4);
            this.executeCommand(9, arrayView, 1).then(result => {
                var data = new Uint8Array(result);
                if (data[0] !== 0) {
                    console.log("sendSavegameChunkCommand rejected with code " + data[0]);
                    reject("RAM chunk not accepted");
                    return;
                }

                resolve();
            },
                error => {
                    reject(error);
                });
        });
    }

    fetchRtcDataCommand(romId) {
        return new Promise((resolve, reject) => {
            var payload = new ArrayBuffer(1);
            var view = new DataView(payload);
            var arrayView = new Uint8Array(payload);
            view.setUint8(0, romId);

            this.executeCommand(10, arrayView, 49).then(result => {
                var data = new Uint8Array(result);
                if (data[0] !== romId) {
                    console.log("fetchRtcDataCommand rejected with code " + data[0]);
                    reject("RTC data could not be fetched");
                    return;
                }

                resolve(data.slice(1));
            },
                error => {
                    reject(error);
                });
        });
    }

    sendRtcDataCommand(romId, data) {
        return new Promise((resolve, reject) => {
            var payload = new ArrayBuffer(49);
            var view = new DataView(payload);
            var arrayView = new Uint8Array(payload);
            view.setUint8(0, romId);
            arrayView.set(data, 1);

            this.executeCommand(11, arrayView, 1).then(result => {
                var data = new Uint8Array(result);
                if (data[0] !== romId) {
                    console.log("sendRtcDataCommand rejected with code " + data[0]);
                    reject("RTC data could not be send");
                    return;
                }

                resolve(data.subarray(1, 49));
            },
                error => {
                    reject(error);
                });
        });
    }

}

export default Communication;