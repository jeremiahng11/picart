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

test('clicking the hero opens his status sheet, and clicking away closes it', () => {
  const { container } = renderConnected();

  expect(screen.queryByText(/CLICK ANYWHERE TO CLOSE/i)).not.toBeInTheDocument();

  // The battle is aria-hidden decoration, so the target is found by class
  // rather than by role.
  fireEvent.click(container.querySelector('.bs-hit'));
  expect(screen.getByText(/CLICK ANYWHERE TO CLOSE/i)).toBeInTheDocument();
  expect(screen.getByText(/WORN SWORD/i)).toBeInTheDocument();

  fireEvent.click(screen.getByText(/CLICK ANYWHERE TO CLOSE/i).closest('.bs-sheet-wrap'));
  expect(screen.queryByText(/CLICK ANYWHERE TO CLOSE/i)).not.toBeInTheDocument();
});

test('the status sheet has an inventory tab that does not close the sheet', () => {
  const { container } = renderConnected();
  fireEvent.click(container.querySelector('.bs-hit'));

  // Decorative and aria-hidden, so the tabs are found by class rather than role.
  const tabs = Array.from(container.querySelectorAll('.bs-tab'));
  expect(tabs.map((t) => t.textContent.trim())).toEqual(['STATUS', 'INVENTORY']);

  fireEvent.click(tabs[1]);

  // Clicking inside the sheet must not fall through to the backdrop.
  expect(screen.getByText(/NOTHING SPARE/i)).toBeInTheDocument();
  expect(screen.getByText(/CLICK ANYWHERE TO CLOSE/i)).toBeInTheDocument();
});

test('equipment slots are listed with their fallbacks when nothing is found yet', () => {
  const { container } = renderConnected();
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
});
