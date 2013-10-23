'use strict';

module.exports = function (grunt, connection, source, target, cb) {
    connection.sftp(function (error, sftp) {
        if (error) {
            grunt.log.error(error);
            return cb(error);
        } else {
            grunt.log.writeln('Uploading ' + source + ' to ' + target);

            sftp.fastPut(source, target, function (err) {
                if (err) {
                    grunt.log.error(err);
                } else {
                    grunt.log.ok();
                }
                sftp.end();
                cb(err);
            });
        }
    });
};