const React = require('react');
const {View} = require('react-native');

function MockIcon(props) {
  return React.createElement(View, props);
}

module.exports = new Proxy(
  {__esModule: true},
  {
    get(target, property) {
      if (property === '__esModule') {
        return true;
      }
      return MockIcon;
    },
  },
);
