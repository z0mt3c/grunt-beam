'use strict';

var fs = require('fs');
var path = require('path');
var _ = require('underscore');

module.exports = function (options) {
    var templateFile = path.join(path.dirname(fs.realpathSync(__filename)), 'upstart.tpl');
    var template = fs.readFileSync(templateFile, 'utf8');
    var compiled = _.template(template);
    return compiled(options);
};