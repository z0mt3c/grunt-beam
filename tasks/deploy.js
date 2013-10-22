'use strict';

module.exports = function (grunt) {
    grunt.registerTask('beam', 'Prepare deployment', function (group) {
        // rough config check
        grunt.config.requires('beam.' + group + '.servers');
        grunt.config.requires('beam.' + group + '.release');
        grunt.config.requires('beam.' + group + '.path');
        var options = grunt.config.get('beam.' + group);

        // require dependencies
        var self = this;
        var done = self.async();
        var path = require('path');
        var inquirer = require('inquirer');
        var async = require('async');
        var Connection = require('ssh2');
        var _ = require('underscore');
        var undeploy = grunt.option('undeploy') === true;
        var removeDeployment = grunt.option('remove') === true;
        var rollback = grunt.option('rollback');

        var defaultOptions = {};
        defaultOptions.archiveName = path.basename(options.release, '.tar.gz');
        defaultOptions.releasesDir = options.path + '/releases';
        defaultOptions.currentLink = options.path + '/current';
        defaultOptions.currentDir = options.path + '/releases/' + defaultOptions.archiveName;
        defaultOptions.targetReleaseFileName = 'RELEASE.tar.gz';
        defaultOptions.appName = 'default';
        defaultOptions.jobName = options.appName || defaultOptions.appName;
        defaultOptions.nodeUser = 'root';
        defaultOptions.nodeEnv = 'production';
        defaultOptions.appEnv = '';
        defaultOptions.nodeBinary = 'node';
        defaultOptions.npmBinary = 'npm';
        defaultOptions.appCommand = 'index.js';
        defaultOptions.logPath = defaultOptions.currentLink + '/logs';
        defaultOptions.errLog = defaultOptions.logPath + '/node-' + (options.appName || defaultOptions.appName) + '.err.log';
        defaultOptions.stdLog = defaultOptions.logPath + '/node-' + (options.appName || defaultOptions.appName) + '.std.log';
        options = _.extend(defaultOptions, options);

        grunt.log.writeln('Preparing deployment on target: ' + group + ' with a total of ' + options.servers.length + ' server(s)');

        var generateUpstart = function () {
            var tmpl = '#!upstart\n' +
                'description "' + options.appName + ' node app"\n' +
                'author      "grunt-beam"\n' +
                '\n' +
                'start on runlevel [2345]\n' +
                'stop on shutdown\n' +
                '\n' +
                'respawn\n' +
                'respawn limit 99 5\n' +
                '\n' +
                'script\n' +
                'cd ' + options.currentLink + ' && exec sudo -u ' + options.nodeUser + ' NODE_ENV=' + options.nodeEnv + ' ' + options.appEnv + ' ' + options.nodeBinary + ' ' + defaultOptions.currentLink + '/' + options.appCommand + ' 2>> ' + options.errLog + ' 1>> ' + options.stdLog + '\n' +
                'end script\n';

            return tmpl;
        };

        var connect = function (cb, completed) {
            var i = 0;
            async.eachSeries(options.servers, function (server, next) {

                grunt.log.subhead('Deploying on server...');
                inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'deploy',
                        message: 'Ready to start deployment on server ' + server.host + ' (or skip)? (' + (++i) + ' of ' + options.servers.length + ')',
                        default: true
                    }
                ], function (answers) {
                    if (answers.deploy) {
                        var connection = new Connection();
                        grunt.log.subhead('Connecting');

                        connection.on('connect', function () {
                            grunt.log.writeln('Connecting to server: ' + server.host);
                        });

                        connection.on('close', function () {
                            grunt.log.debug('Closed connection for server: ' + server.host);
                        });

                        connection.on('ready', function () {
                            grunt.log.ok();
                            cb(server, connection, next);
                        });

                        connection.on('error', function (error) {
                            grunt.log.error('Error on server: ' + server.host);
                            grunt.log.error(error);
                            if (error) {
                                throw error;
                            }
                        });

                        connection.connect(server);
                    } else {
                        next();
                    }
                });

            }, completed);
        };

        var processServer = function (server, connection, completed) {
            // executes a remote command via ssh
            var exec = function (cmd, shouldReturnData, next, ignoreStatusCode) {
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
                            grunt.log.debug('Exit-Code: ' + code + ', Signal: ' + signal);
                            var mError = code === 0 || ignoreStatusCode ? null : new Error('Exit with code ' + code);
                            if (!mError && !shouldReturnData) {
                                grunt.log.ok();
                            }
                            next(mError, code, signal, returnData);
                        });
                    }
                });
            };

            var upload = function (source, target, cb) {
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

            var write = function (content, target, cb) {
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
                            grunt.log.error('Error on server: ' + server.host);
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


            var checkUptime = function (cb) {
                grunt.log.subhead('Checking uptime');
                exec('uptime', false, function (err) {
                    return cb(err);
                });
            };

            var checkNodeVersion = function (cb) {
                grunt.log.subhead('Checking node.js version');
                exec('node --version', true, function (err, exit, signal, data) {
                    if (data) {
                        var result = data.match(new RegExp('v([0-9\\.]{1,8})'));
                        if (result) {
                            if (_.isString(options.nodeVersion) && result[1].indexOf(options.nodeVersion) === 0) {
                                grunt.log.ok();
                                return cb();
                            } else if (_.isFunction(options.nodeVersion) && options.nodeVersion(result[1])) {
                                grunt.log.ok();
                                return cb();
                            } else {
                                var msg = 'Node-Version ' + result[1] + ' does not match' + (_.isString(options.nodeVersion) ? ' required: ' + options.nodeVersion : '');
                                grunt.log.error(msg);
                                return cb(new Error(msg));
                            }
                        } else {
                            return cb(new Error('Not node version-code returned'));
                        }
                    }

                    return cb(err);
                });
            };

            var uploadRelease = function (cb) {
                grunt.log.subhead('Uploading deployment archive');
                upload(options.release, options.currentDir + '/' + options.targetReleaseFileName, function (error) {
                    return cb(error);
                });
            };

            var prepareDirectories = function (cb) {
                grunt.log.subhead('Preparing directory structure');
                exec('mkdir -p ' + options.currentDir + '/logs', false, function (err) {
                    return cb(err);
                });
            };

            var extractRelease = function (cb) {
                grunt.log.subhead('Extracting release');
                exec('cd ' + options.currentDir + ' && tar xzfsv ' + options.targetReleaseFileName + ' && rm ' + options.targetReleaseFileName, false, function (err) {
                    return cb(err);
                });
            };

            var npmInstall = function (cb) {
                grunt.log.subhead('Install dependencies');
                exec('cd ' + options.currentDir + ' && npm install --production', false, function (err) {
                    return cb(err);
                });
            };

            var createSymlink = function (cb) {
                grunt.log.subhead('Create symlink');
                exec('ln -sf ' + options.currentDir + ' ' + options.currentLink, false, function (err) {
                    return cb(err);
                });
            };

            var writeUpstart = function (cb) {
                grunt.log.subhead('Creating upstart script');
                write(generateUpstart(), '/etc/init/' + options.appName + '.conf', function (error) {
                    return cb(error);
                });
            };

            var removeUpstart = function (cb) {
                grunt.log.subhead('Removing upstart script');
                exec('rm /etc/init/' + options.appName + '.conf', false, function (err) {
                    return cb(err);
                });
            };

            var cleanDeployment = function (cb) {
                grunt.log.subhead('Removing deployment');
                exec('rm -Rf ' + options.path, false, function (err) {
                    return cb(err);
                });
            };

            var stopApp = function (cb) {
                grunt.log.subhead('Stopping application (if running)');
                exec('stop ' + options.jobName, false, function (err) {
                    return cb(err);
                }, true);
            };

            var startApp = function (cb) {
                grunt.log.subhead('Starting application');
                exec('start ' + options.jobName, false, function (err) {
                    return cb(err);
                });
            };

            var closeConnection = function (cb) {
                grunt.log.subhead('Closing connection');
                connection.end();
                return cb();
            };

            var tasks = [];

            if (undeploy || removeDeployment) {
                tasks.push(stopApp);
                tasks.push(removeUpstart);

                if (removeDeployment) {
                    tasks.push(cleanDeployment);
                }
            } else if (rollback) {

            } else {
                tasks.push(checkUptime);

                if (options.nodeVersion) {
                    tasks.push(checkNodeVersion);
                }

                tasks.push(prepareDirectories);
                tasks.push(uploadRelease);
                tasks.push(extractRelease);
                tasks.push(createSymlink);
                tasks.push(npmInstall);
                tasks.push(writeUpstart);
                tasks.push(stopApp);
                tasks.push(startApp);
                tasks.push(closeConnection);
            }

            async.series(tasks, function () {
                completed();
            });
        };


        connect(
            function (server, connection, next) {
                processServer(server, connection, function () {
                    next();
                });
            },
            function () {
                grunt.log.ok('Deployment completed!');
                done();
            }
        );
    });
};
