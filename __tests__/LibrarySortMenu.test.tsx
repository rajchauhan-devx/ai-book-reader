import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Modal } from 'react-native';
import { LibrarySortMenu } from '../src/components/LibrarySortMenu';
jest.mock('../src/theme/ThemeProvider', () => ({
  useAppTheme: () => ({ colors: require('../src/theme/tokens').lightColors }),
}));
test('exposes all four choices including author and closes after selection', async () => {
  const choose = jest.fn(),
    close = jest.fn();
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <LibrarySortMenu
        visible
        value="title"
        onSelect={choose}
        onClose={close}
      />,
    );
  });
  // React Native's test renderer treats Modal as a native portal, so render its
  // children explicitly to verify the complete Android choice list.
  const modal = tree.root.findByType(Modal);
  let dialog!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    dialog = TestRenderer.create(modal.props.children);
  });
  const options = dialog.root.findAll(
    node => node.props.accessibilityRole === 'radio',
  );
  expect([
    ...new Set(options.map(node => node.props.accessibilityLabel as string)),
  ]).toEqual(['Recently read', 'Newest added', 'Title A–Z', 'Author A–Z']);
  expect(
    options.some(
      node =>
        node.props.accessibilityLabel === 'Title A–Z' &&
        node.props.accessibilityState.checked,
    ),
  ).toBe(true);
  const author = options.find(
    node =>
      node.props.accessibilityLabel === 'Author A–Z' &&
      typeof node.props.onPress === 'function',
  );
  expect(author).toBeDefined();
  await act(async () => author!.props.onPress());
  expect(choose).toHaveBeenCalledWith('author');
  expect(close).toHaveBeenCalledTimes(1);
  await act(async () => {
    dialog.unmount();
    tree.unmount();
  });
});
test('Android back dismisses sorting without changing the choice', async () => {
  const choose = jest.fn(),
    close = jest.fn();
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <LibrarySortMenu
        visible
        value="recent"
        onSelect={choose}
        onClose={close}
      />,
    );
  });
  await act(async () => tree.root.findByType(Modal).props.onRequestClose());
  expect(close).toHaveBeenCalledTimes(1);
  expect(choose).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});
