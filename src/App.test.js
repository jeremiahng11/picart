import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import App from './App';

// jsdom implements no WebUSB, so the app renders its unsupported-browser path.
test('tells the user when the browser has no WebUSB support', () => {
  render(<App />);
  expect(screen.getByText(/does not support WebUSB/i)).toBeInTheDocument();
});

test('offers the offline build as a fallback', () => {
  render(<App />);
  expect(screen.getByRole('link', { name: /here/i })).toHaveAttribute(
    'href',
    expect.stringContaining('github.com/jeremiahng11/picart')
  );
});

// The connected view is the bulk of the UI and was previously untested; jsdom
// has no WebUSB, so the device is stubbed and the state set directly.
function renderConnected(overrides = {}) {
  Object.defineProperty(window.navigator, 'usb', {
    value: { addEventListener() { }, removeEventListener() { } },
    configurable: true,
  });

  const ref = React.createRef();
  const view = render(<App ref={ref} />);

  act(() => {
    ref.current.setState({
      state: 'Connected',
      deviceInfo: {
        swVersion: { major: 0, minor: 5, patch: 2, buildType: 'R', gitShort: 0xa1b2c3, gitDirty: true },
      },
      serialId: 'ABC123',
      romUtilization: { numRoms: 2, usedBanks: 192, maxBanks: 512 },
      romInfos: [
        { romId: 0, name: 'POKEMON RED', numRamBanks: 4, mbc: 3, numRomBanks: 64 },
        { romId: 1, name: 'ZELDA DX', numRamBanks: 0, mbc: 0xFF, numRomBanks: 32 },
      ],
      ...overrides,
    });
  });

  return { ...view, ref };
}

// The connect screen is where the game is on show and the hero can be reached.
function renderPlaying() {
  Object.defineProperty(window.navigator, 'usb', {
    value: { addEventListener() { }, removeEventListener() { } },
    configurable: true,
  });

  const ref = React.createRef();
  return { ...render(<App ref={ref} />), ref };
}

test('lists each rom with its metadata', () => {
  renderConnected();

  expect(screen.getByText('POKEMON RED')).toBeInTheDocument();
  expect(screen.getByText('64 banks · 4 RAM banks · MBC3')).toBeInTheDocument();
  expect(screen.getByText('ZELDA DX')).toBeInTheDocument();
  expect(screen.getByText('32 banks')).toBeInTheDocument();
});

test('reports storage as used, total and free', () => {
  renderConnected();

  expect(screen.getByText('192 / 512 banks')).toBeInTheDocument();
  expect(screen.getByText('320 free')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '192');
});

test('disables the savegame button for a rom with no ram', () => {
  renderConnected();

  expect(screen.getByRole('button', { name: /Manage savegame for POKEMON RED/i })).toBeEnabled();
  expect(screen.getByRole('button', { name: /Manage savegame for ZELDA DX/i })).toBeDisabled();
});

test('shows firmware details in the footer', () => {
  renderConnected();

  expect(screen.getByText(/Firmware 0\.5\.2 R/)).toBeInTheDocument();
  expect(screen.getByText('dirty')).toBeInTheDocument();
  expect(screen.getByText(/Serial ABC123/)).toBeInTheDocument();
});

test('tells the user when the cartridge holds no roms', () => {
  renderConnected({ romInfos: [], romUtilization: { numRoms: 0, usedBanks: 0, maxBanks: 512 } });

  expect(screen.getByText(/No ROMs on this cartridge yet/i)).toBeInTheDocument();
});

test('clicking the hero opens his status sheet, and the X closes it', () => {
  const { container } = renderPlaying();

  expect(container.querySelector('.bs-sheet')).toBeNull();

  // The battle is aria-hidden decoration, so targets are found by class rather
  // than by role.
  fireEvent.click(container.querySelector('.bs-hit'));
  expect(container.querySelector('.bs-sheet')).not.toBeNull();
  expect(screen.getByText(/WORN SWORD/i)).toBeInTheDocument();

  fireEvent.click(container.querySelector('.bs-close'));
  expect(container.querySelector('.bs-sheet')).toBeNull();
});

test('clicking the backdrop also closes the sheet', () => {
  const { container } = renderPlaying();

  fireEvent.click(container.querySelector('.bs-hit'));
  expect(container.querySelector('.bs-sheet')).not.toBeNull();

  fireEvent.click(container.querySelector('.bs-sheet-wrap'));
  expect(container.querySelector('.bs-sheet')).toBeNull();
});

test('the status sheet has an inventory tab that does not close the sheet', () => {
  const { container } = renderPlaying();
  fireEvent.click(container.querySelector('.bs-hit'));

  // Decorative and aria-hidden, so the tabs are found by class rather than role.
  const tabs = Array.from(container.querySelectorAll('.bs-tab'));
  expect(tabs.map((t) => t.textContent.trim())).toEqual(['STATUS', 'INVENTORY']);

  fireEvent.click(tabs[1]);

  // Clicking inside the sheet must not fall through to the backdrop.
  expect(screen.getByText(/NOTHING SPARE/i)).toBeInTheDocument();
  expect(container.querySelector('.bs-sheet')).not.toBeNull();
});

test('equipment slots are listed with their fallbacks when nothing is found yet', () => {
  const { container } = renderPlaying();
  fireEvent.click(container.querySelector('.bs-hit'));

  // He sets out in clothes with a worn sword: every slot but the weapon is empty.
  expect(screen.getByText('WORN SWORD')).toBeInTheDocument();
  expect(screen.getByText('CLOTH SHIRT')).toBeInTheDocument();
  expect(screen.getByText('CLOTH PANTS')).toBeInTheDocument();
  expect(screen.getByText('WORN SHOES')).toBeInTheDocument();
  expect(screen.getAllByText('BARE HANDS').length).toBeGreaterThan(0);
  expect(screen.getByText('NONE')).toBeInTheDocument();
  expect(screen.getByText('BARE HEAD')).toBeInTheDocument();
  expect(screen.getByText(/LV 1 \/ 99/)).toBeInTheDocument();
  expect(screen.getByText('GOLD')).toBeInTheDocument();
});

test('the manager covers the game while a cartridge is connected', () => {
  const { container } = renderConnected();

  const panel = container.querySelector('.cart__content');
  expect(panel.classList.contains('is-solid')).toBe(true);
});

test('the connect screen leaves the game on show', () => {
  Object.defineProperty(window.navigator, 'usb', {
    value: { addEventListener() { }, removeEventListener() { } },
    configurable: true,
  });
  const { container } = render(<App />);

  const panel = container.querySelector('.cart__content');
  expect(panel.classList.contains('is-solid')).toBe(false);
});

test('the X hands the cartridge back and the game returns', async () => {
  const { container } = renderConnected();

  expect(screen.getByText('POKEMON RED')).toBeInTheDocument();

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /disconnect the cartridge/i }));
  });

  expect(screen.queryByText('POKEMON RED')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^connect$/i })).toBeInTheDocument();
  expect(container.querySelector('.cart__content').classList.contains('is-solid')).toBe(false);
});

test('disconnecting says so', async () => {
  renderConnected();

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /disconnect the cartridge/i }));
  });

  expect(await screen.findByText(/cartridge disconnected/i)).toBeInTheDocument();
});


test('a finished upload is announced by name', async () => {
  const { ref } = renderConnected();

  // The refresh that follows an upload talks to the cartridge, so it is given
  // something to talk to.
  ref.current.comm = {
    readDeviceInfoCommand: async () => ({
      featureStep: 3,
      swVersion: { major: 0, minor: 5, patch: 2, buildType: 'R', gitShort: 1, gitDirty: false },
    }),
    readDeviceSerialId: async () => 'ABC123',
    readRomUtilizationCommand: async () => ({ numRoms: 0, usedBanks: 0, maxBanks: 512 }),
    readRomInfoCommand: async () => ({}),
  };

  await act(async () => {
    await ref.current.refreshDeviceStatus('POKEMON RED');
  });

  expect(await screen.findByText(/POKEMON RED.*uploaded/i)).toBeInTheDocument();
});

test('a refresh that was not an upload announces nothing', async () => {
  const { ref } = renderConnected();

  ref.current.comm = {
    readDeviceInfoCommand: async () => ({
      featureStep: 3,
      swVersion: { major: 0, minor: 5, patch: 2, buildType: 'R', gitShort: 1, gitDirty: false },
    }),
    readDeviceSerialId: async () => 'ABC123',
    readRomUtilizationCommand: async () => ({ numRoms: 0, usedBanks: 0, maxBanks: 512 }),
    readRomInfoCommand: async () => ({}),
  };

  await act(async () => {
    await ref.current.refreshDeviceStatus();
  });

  expect(screen.queryByText(/uploaded/i)).not.toBeInTheDocument();
});

test('the fireflies drift behind the fighters, not over them', () => {
  const { container } = renderConnected();

  const nodes = Array.from(container.querySelectorAll('.sc, .sprite, .bs-field'));
  const order = nodes.map((n) => (
    n.classList.contains('sc') ? 'scenery'
      : n.classList.contains('bs-field') ? 'field'
        : 'ambience'
  ));

  // Painting order is document order here, so the scenery must come first, the
  // ambience next, and the fighters last.
  expect(order[0]).toBe('scenery');
  expect(order[order.length - 1]).toBe('field');
  expect(order.filter((o) => o === 'ambience').length).toBeGreaterThan(0);
  expect(order.indexOf('ambience')).toBeLessThan(order.indexOf('field'));
});

test('the game takes no clicks while the manager covers it', () => {
  const { container } = renderConnected();

  // The hero's target would otherwise sit above the panel and swallow clicks
  // meant for the footer beneath it.
  expect(container.querySelector('.bs-hit')).toBeNull();
});

test('clicking the serial does not open the character sheet', () => {
  const { container } = renderConnected();

  fireEvent.click(screen.getByText(/Serial ABC123/));

  expect(container.querySelector('.bs-sheet')).toBeNull();
  expect(screen.getByText('POKEMON RED')).toBeInTheDocument();
});

test('the target comes back once the cartridge is handed over', async () => {
  const { container } = renderConnected();
  expect(container.querySelector('.bs-hit')).toBeNull();

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /disconnect the cartridge/i }));
  });

  expect(container.querySelector('.bs-hit')).not.toBeNull();
});
