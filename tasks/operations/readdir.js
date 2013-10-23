'use strict';

module.exports = function (grunt, connection, target, cb) {
    connection.sftp(function (error, sftp) {
        if (error) {
            grunt.log.error(error);
            return cb(error);
        } else {
            grunt.log.writeln('Opening directory: ' + target);
            sftp.opendir(target, function (err, handle) {
                if (err) {
                    return cb(err);
                }

                grunt.log.writeln('Reading directory list');
                sftp.readdir(handle, function (err, list) {
                    cb(err, list);
                });
            });
        }
    });
};