'use strict';

module.exports = function (grunt, connection, content, target, cb) {
    connection.sftp(function (error, sftp) {
        if (error) {
            grunt.log.error(error);
            return cb(error);
        } else {
            var stream = sftp.createWriteStream(target, { flags: 'w' });

            stream.on('data', function (data) {
                grunt.log.write(data);
            });

            stream.on('error', function (err) {
                grunt.log.error(err);
                if (err) {
                    throw err;
                }
            });

            stream.once('open', function () {
                grunt.log.writeln('Writing to ' + target);
                stream.end(content, function (e) {
                    sftp.end();
                    if (!e) {
                        grunt.log.ok();
                    }
                    return cb(e);
                });
            });
        }
    });
};