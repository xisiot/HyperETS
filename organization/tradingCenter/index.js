var TradingCenter = require('./TradingCenter');
var config = require('../../config');

var tradingCenter = new TradingCenter(config);

module.exports = tradingCenter;