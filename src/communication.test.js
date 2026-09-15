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

// --- opening the device ---

function fakeUsb({ granted = [], onRequest, device } = {}) {
  const dev = device || {
    opened: false,
    configuration: { configurationValue: 1, interfaces: [] },
    open: () => Promise.resolve(),
    selectConfiguration: () => Promise.resolve(),
    claimInterface: () => Promise.resolve(),
    selectAlternateInterface: () => Promise.resolve(),
    controlTransferOut: () => Promise.resolve({ status: 'ok' }),
  };

  global.navigator.usb = {
    getDevices: () => Promise.resolve(granted),
    requestDevice: onRequest || (() => Promise.resolve(dev)),
  };

  return dev;
}

function withEndpoints(comm) {
  // The real one reads them off the descriptors; the fake device has none.
  comm.getEndpoints = () => {
    comm.ifNum = 0;
    comm.epIn = 1;
    comm.epOut = 2;
  };
  return comm;
}

test('a cartridge the browser already knows opens without asking', async () => {
  let prompted = 0;
  const dev = fakeUsb();
  global.navigator.usb.getDevices = () =>
    Promise.resolve([{ ...dev, vendorId: 0x2e8a, productId: 0x107f }]);
  global.navigator.usb.requestDevice = () => { prompted += 1; return Promise.resolve(dev); };

  const comm = withEndpoints(new Communication());
  await comm.getDevice();

  expect(prompted).toBe(0);
  expect(comm.ready).toBe(true);
});

test('asking to choose shows the chooser even when one is already known', async () => {
  let prompted = 0;
  const dev = fakeUsb();
  global.navigator.usb.getDevices = () =>
    Promise.resolve([{ ...dev, vendorId: 0x2e8a, productId: 0x107f }]);
  global.navigator.usb.requestDevice = () => { prompted += 1; return Promise.resolve(dev); };

  const comm = withEndpoints(new Communication());
  await comm.getDevice({ choose: true });

  expect(prompted).toBe(1);
});

test('with nothing known it falls through to the chooser', async () => {
  let prompted = 0;
  const dev = fakeUsb();
  global.navigator.usb.requestDevice = () => { prompted += 1; return Promise.resolve(dev); };

  const comm = withEndpoints(new Communication());
  await comm.getDevice();

  expect(prompted).toBe(1);
});

test('a device of another kind is not mistaken for the cartridge', async () => {
  let prompted = 0;
  const dev = fakeUsb();
  // A granted device that is not one of ours must not be opened silently.
  global.navigator.usb.getDevices = () =>
    Promise.resolve([{ ...dev, vendorId: 0x1234, productId: 0x5678 }]);
  global.navigator.usb.requestDevice = () => { prompted += 1; return Promise.resolve(dev); };

  const comm = withEndpoints(new Communication());
  await comm.getDevice();

  expect(prompted).toBe(1);
});

test('choosing nothing rejects rather than opening something unasked', async () => {
  fakeUsb();
  const cancelled = new Error('No device selected.');
  cancelled.name = 'NotFoundError';
  global.navigator.usb.requestDevice = () => Promise.reject(cancelled);

  const comm = withEndpoints(new Communication());

  await expect(comm.getDevice()).rejects.toThrow(/no device selected/i);
});

test('a device with no vendor interface is refused rather than half opened', async () => {
  fakeUsb();
  const comm = new Communication();
  comm.getEndpoints = () => { };

  await expect(comm.getDevice()).rejects.toThrow(/vendor interface/i);
});

test('an already open device is not opened twice', async () => {
  let opens = 0;
  const dev = fakeUsb();
  dev.opened = true;
  dev.open = () => { opens += 1; return Promise.resolve(); };

  const comm = withEndpoints(new Communication());
  await comm.getDevice({ choose: true });

  expect(opens).toBe(0);
});

test('a step that never settles is abandoned rather than hanging forever', async () => {
  jest.useFakeTimers();

  const dev = fakeUsb();
  dev.open = () => new Promise(() => { });

  const comm = withEndpoints(new Communication());
  const attempt = comm.getDevice({ choose: true });
  const assertion = expect(attempt).rejects.toThrow(/timed out/i);

  // The chooser resolves through a couple of promise hops before the first
  // bounded step arms its timer, so the queue is drained before the clock moves;
  // advancing too early finds no timer to fire.
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }

  jest.advanceTimersByTime(20000);
  await assertion;

  jest.useRealTimers();
});
