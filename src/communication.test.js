import Communication from './communication';

// Stand-in for a WebUSB device. transferIn returns queued replies in order;
// each reply is the raw response including the echoed command byte.
function fakeComm(responses, options = {}) {
    const comm = new Communication();
    const queue = responses.slice();

    comm.epIn = 1;
    comm.epOut = 2;
    comm.sent = [];
    comm.device = {
        transferOut: (ep, buffer) => {
            comm.sent.push(new Uint8Array(buffer.slice(0)));
            return options.sendFails
                ? Promise.reject(new Error("transfer failed"))
                : Promise.resolve({ status: "ok" });
        },
        transferIn: () => {
            const next = queue.shift();
            return next
                ? Promise.resolve(next)
                : Promise.reject(new Error("no queued response"));
        },
    };

    return comm;
}

function reply(bytes, status = "ok") {
    return { status, data: new DataView(Uint8Array.from(bytes).buffer) };
}

test('readRomUtilizationCommand parses a well formed response', async () => {
    const comm = fakeComm([reply([1, 3, 0x00, 0x10, 0x02, 0x00])]);

    await expect(comm.readRomUtilizationCommand()).resolves.toEqual({
        numRoms: 3,
        usedBanks: 0x0010,
        maxBanks: 0x0200,
    });
});

// A DataView read past the end of a short response used to throw inside the
// promise executor, leaving the promise unsettled and the caller awaiting it
// forever.
test('readRomUtilizationCommand rejects a short response rather than hanging', async () => {
    const comm = fakeComm([reply([1, 3, 0x00])]);

    await expect(comm.readRomUtilizationCommand())
        .rejects.toMatch(/Could not parse rom utilization/);
});

// Firmware without MBC info returns 20 payload bytes. Reading numRomBanks at
// offset 19 needs 21, so the guard has to reject this shape, not attempt it.
test('readRomInfoCommand tolerates a response with no rom bank count', async () => {
    const payload = new Array(20).fill(0);
    [0x54, 0x45, 0x53, 0x54].forEach((b, i) => { payload[i] = b; });
    payload[17] = 4;

    const comm = fakeComm([reply([4, ...payload])]);
    const info = await comm.readRomInfoCommand(0);

    expect(info.name).toBe("TEST");
    expect(info.numRamBanks).toBe(4);
    expect(info.numRomBanks).toBe(0);
});

test('readRomInfoCommand reads the rom bank count when the response carries it', async () => {
    const payload = new Array(21).fill(0);
    payload[0] = 0x41;
    payload[17] = 2;
    payload[18] = 3;
    payload[19] = 0x00;
    payload[20] = 0x10;

    const comm = fakeComm([reply([4, ...payload])]);
    comm.supportsMbcInfo = true;
    const info = await comm.readRomInfoCommand(1);

    expect(info.mbc).toBe(3);
    expect(info.numRomBanks).toBe(16);
});

// This command is documented as never rejecting; callers read the result
// without guarding it.
test('readDeviceInfoCommand falls back when the response cannot be parsed', async () => {
    const comm = fakeComm([reply([254, 1])]);
    const info = await comm.readDeviceInfoCommand();

    expect(info.featureStep).toBe(0);
    expect(info.swVersion.buildType).toBe("E");
});

test('readDeviceInfoCommand records the advertised feature step', async () => {
    const comm = fakeComm([reply([254, 3, 1, 0, 5, 2, 0x45, 0, 0, 0, 1, 0])]);
    const info = await comm.readDeviceInfoCommand();

    expect(info.featureStep).toBe(3);
    expect(comm.supportsSpeedChangeBankInfo).toBe(true);
    expect(comm.supportsMbcInfo).toBe(true);
});

test('deleteRomCommand rejects when the device refuses', async () => {
    const comm = fakeComm([reply([5, 1, 0])]);

    await expect(comm.deleteRomCommand(0)).rejects.toBe("Delete failed");
});

test('executeCommand rejects when the device echoes a different command', async () => {
    const comm = fakeComm([reply([99, 0, 0, 0, 0, 0])]);

    await expect(comm.readRomUtilizationCommand()).rejects.toBe("Wrong answer");
});

test('executeCommand rejects a transfer that did not complete', async () => {
    const comm = fakeComm([reply([1, 0, 0, 0, 0, 0], "stall")]);

    await expect(comm.readRomUtilizationCommand()).rejects.toMatch(/status=stall/);
});

// send() is awaited before the read is issued, so a failed write surfaces here
// instead of as an unhandled rejection plus a misleading read error.
test('a failed send rejects the command', async () => {
    const comm = fakeComm([reply([1, 0, 0, 0, 0, 0])], { sendFails: true });

    await expect(comm.readRomUtilizationCommand()).rejects.toThrow("transfer failed");
});

test('the command byte precedes the payload on the wire', async () => {
    const comm = fakeComm([reply([5, 0, 0])]);
    await comm.deleteRomCommand(7);

    expect(Array.from(comm.sent[0])).toEqual([5, 7]);
});

test('close releases the interface and clears the device', async () => {
    const released = [];
    const comm = fakeComm([]);
    comm.ifNum = 2;
    comm.device.releaseInterface = (n) => { released.push(n); return Promise.resolve(); };
    comm.device.close = () => { released.push("closed"); return Promise.resolve(); };

    await comm.close();

    expect(released).toEqual([2, "closed"]);
    expect(comm.device).toBeNull();
});

test('close is safe to call twice', async () => {
    const comm = fakeComm([]);
    comm.device.releaseInterface = () => Promise.resolve();
    comm.device.close = () => Promise.resolve();

    await comm.close();
    await expect(comm.close()).resolves.toBeUndefined();
});
