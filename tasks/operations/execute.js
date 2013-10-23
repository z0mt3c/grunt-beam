'use strict';

var _ = require('underscore');

module.exports = function (grunt, connection, cmd, ignoreError, returnOut, next) {
    if (_.isFunction(ignoreError)) {
        next = ignoreError;
        ignoreError = false;
        returnOut = false;
    } else if (_.isFunction(returnOut)) {
        next = returnOut;
        returnOut = false;
    }

    connection.exec(cmd, function (error, stream) {
        grunt.log.writeln('$ ' + cmd);

        if (error) {
            next(error);
        } else {
            var returnData = '';

            stream.on('data', function (data) {
                data = data ? data.toString() : null;
                returnData += data;
                grunt.log.write(data);
            });

            stream.on('exit', function (code, signal) {
                var msg = 'Exit-Code: ' + code + ', Signal: ' + signal;
                grunt.log.debug(msg);
                var mError = code === 0 || ignoreError ? null : new Error(msg);
                if (!mError && !returnOut) {
                    grunt.log.ok();
                }
                next(mError, code, signal, returnData);
            });
        }
    });
};