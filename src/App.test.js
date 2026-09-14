import { render, screen } from '@testing-library/react';
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
    expect.stringContaining('releases')
  );
});
