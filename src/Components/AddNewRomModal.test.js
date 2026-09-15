import React from 'react';
import { render, act } from '@testing-library/react';
import AddNewRomModal from './AddNewRomModal';

function renderUploading(state) {
  const ref = React.createRef();
  const view = render(
    <AddNewRomModal
      ref={ref}
      show
      onHide={() => {}}
      onRomAdded={() => {}}
      onError={() => {}}
      comm={{}}
      availableBanks={512}
    />
  );

  act(() => {
    ref.current.setState({
      romInfo: { banks: 64, name: 'POKEMON RED', speedchangeBank: 0xFFFF },
      uploadInProgress: true,
      ...state,
    });
  });

  return { ...view, ref };
}

test('the bar reports how far the upload has got', () => {
  const { ref } = renderUploading({ uploadedBank: 16, uploadRequestInProgress: false });
  expect(ref.current.uploadPercent()).toBe(25);
});

test('the bar reaches a hundred when the last bank is sent', () => {
  const { ref } = renderUploading({ uploadedBank: 64, uploadRequestInProgress: false });
  expect(ref.current.uploadPercent()).toBe(100);
});

test('the percentage never runs past a hundred', () => {
  const { ref } = renderUploading({ uploadedBank: 99, uploadRequestInProgress: false });
  expect(ref.current.uploadPercent()).toBe(100);
});

test('a rom of no banks does not divide by zero', () => {
  const { ref } = renderUploading({ romInfo: { banks: 0, name: '', speedchangeBank: 0xFFFF } });
  expect(ref.current.uploadPercent()).toBe(0);
});

// The modal renders through a portal, so it lands on the document rather than
// inside the container the render returns.
test('while the cartridge is still deciding the bar says so instead of lying', () => {
  renderUploading({ uploadedBank: 64, uploadRequestInProgress: true });
  expect(document.querySelector('.progress-bar').textContent).toMatch(/Preparing/i);
});

test('once underway the bar shows the percentage', () => {
  renderUploading({ uploadedBank: 32, uploadRequestInProgress: false });
  expect(document.querySelector('.progress-bar').textContent).toBe('50%');
});
