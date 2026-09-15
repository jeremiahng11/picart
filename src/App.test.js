import React from 'react';
import { render, screen, act } from '@testing-library/react';
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

  return view;
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
