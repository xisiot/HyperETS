var EnvAgency = require('./EnvAgency');
var config = require('../../config')

var envAgency = new EnvAgency(config);

module.exports = envAgency;