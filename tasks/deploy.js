'use strict';

module.exports = function (grunt) {
    var path = require('path');
    var inquirer = require('inquirer');
    var async = require('async');
    var Connection = require('ssh2');
    var _ = require('underscore');
    var upstartGen = require('./upstart/upstartScriptGenerator');
    var operations = require('./operations');
    var packageInfo = grunt.file.readJSON('package.json');

    var beamDefaultServerOptions = {
        enterCredentials: false,
        agent: process.env.SSH_AUTH_SOCK,
        pingInterval: 3000,
        port: 22,
        username: 'root'
    };

    var beamDefaultOptions = {
        appName: packageInfo.name,
        packageInfo: packageInfo,
        releaseArchive: './release.tar.gz',
        releaseArchiveTarget: 'RELEASE.tar.gz',
        releaseFolderName: 'releases',
        currentLinkName: 'current',
        logFolderName: 'logs',
        targetPath: '/var/apps',
        releaseName: packageInfo.name + '-' + packageInfo.version,
        nodeUser: '',
        nodeEnv: '',
        nodeEnvExtras: '',
        nodeBinary: 'node',
        npmBinary: 'npm',
        npmInstallOptions: '--production',
        appCommand: packageInfo.main || 'index.js',

        archiveFileName: function () {
            return path.basename(this.releaseArchive, '.tar.gz');
        },
        applicationPath: function () {
            return path.join(this.targetPath, this.appName);
        },
        releasesPath: function () {
            return path.join(this.applicationPath(), this.releaseFolderName);
        },
        currentReleasePath: function () {
            return path.join(this.releasesPath(), (_.isFunction(this.releaseName) ? this.releaseName() : this.releaseName));
        },
        releaseArchiveTargetPath: function () {
            return path.join(this.currentReleasePath(), this.releaseArchiveTarget);
        },
        currentLinkPath: function () {
            return path.join(this.applicationPath(), this.currentLinkName);
        },
        appCommandPathSym: function () {
            return path.join(this.currentLinkPath(), this.appCommand);
        },
        logPath: function () {
            return path.join(this.currentReleasePath(), this.logFolderName);
        },
        logPathSym: function () {
            return path.join(this.currentLinkPath(), this.logFolderName);
        },
        logFileNameErr: function () {
            return this.appName + '.err.log';
        },
        logFileNameStd: function () {
            return this.appName + '.std.log';
        },
        _jobName: function () {
            return this.jobName || this.appName;
        },
        logFilePathSymErr: function () {
            return path.join(this.logPathSym(), (_.isFunction(this.logFileNameErr) ? this.logFileNameErr() : this.logFileNameErr));
        },
        logFilePathSymStd: function () {
            return path.join(this.logPathSym(), (_.isFunction(this.logFileNameStd) ? this.logFileNameStd() : this.logFileNameStd));
        },
        upstartScriptPath: function () {
            return path.join('/etc/init/', this._jobName() + '.conf');
        }
    };

    grunt.registerTask('beam', 'Prepare deployment', function (group) {
        // rough config check
        grunt.config.requires('beam.' + group + '.servers');
        grunt.config.requires('beam.' + group + '.releaseArchive');
        grunt.config.requires('beam.' + group + '.targetPath');

        var self = this,
            done = self.async();

        var taskArgs = {
            undeploy: grunt.option('undeploy') === true,
            remove: grunt.option('remove') === true,
            rollback: grunt.option('rollback')
        };

        var options = _.extend({}, beamDefaultOptions, grunt.config.get('beam.' + group));

        grunt.log.writeln('Preparing deployment on target: ' + group + ' with a total of ' + options.servers.length + ' server(s)');

        var connect = function (cb, completed) {
            var i = 0;

            async.eachSeries(options.servers, function (oServer, next) {
                var server = _.extend({}, beamDefaultServerOptions, oServer);

                var readyMsg;
                var type;

                if (taskArgs.remove) {
                    type = 'Undeploy';
                    readyMsg = 'Ready to undeploy and remove all related files from server (or skip this server)?';
                } else if (taskArgs.undeploy) {
                    type = 'Undeploy';
                    readyMsg = 'Ready to undeploy (or skip this server)?';
                } else if (taskArgs.rollback) {
                    type = 'Rollback';
                    readyMsg = 'Ready to rollback release (or skip this server)?';
                } else {
                    type = 'Deploy';
                    readyMsg = 'Ready to start deployment (or skip this server)?';
                }

                grunt.log.subhead(type + ' on ' + server.host + ' (' + (++i) + ' of ' + options.servers.length + ')');
                inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'deploy',
                        message: readyMsg,
                        default: true
                    },
                    {
                        type: 'input',
                        name: 'user',
                        message: 'Please enter your username:',
                        default: server.user,
                        when: function (answers) {
                            return answers.deploy && server.enterCredentials;
                        }
                    },
                    {
                        type: 'password',
                        name: 'password',
                        message: 'Please enter your password:',
                        when: function (answers) {
                            return answers.deploy && server.enterCredentials;
                        }
                    }
                ], function (answers) {
                    if (answers.deploy) {
                        if (answers.password) {
                            server.password = answers.password;
                        }

                        if (answers.user) {
                            server.username = answers.user;
                        }

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
            var printUptime = function (cb) {
                grunt.log.subhead('Checking uptime');
                operations.exec(grunt, connection, 'uptime', function (err) {
                    return cb(err);
                });
            };

            var checkNodeVersion = function (cb) {
                grunt.log.subhead('Checking node.js version');

                operations.exec(grunt, connection, options.nodeBinary + ' --version', false, true, function (err, exit, signal, data) {
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
                operations.upload(grunt, connection, options.releaseArchive, options.releaseArchiveTargetPath(), function (error) {
                    return cb(error);
                });
            };

            var prepareDirectories = function (cb) {
                grunt.log.subhead('Preparing directory structure');
                operations.exec(grunt, connection, 'mkdir -p ' + options.logPath() + ' && mkdir -p ' + options.currentReleasePath(), function (err) {
                    return cb(err);
                });
            };

            var extractRelease = function (cb) {
                grunt.log.subhead('Extracting release');
                operations.exec(grunt, connection, 'cd ' + options.currentReleasePath() + ' && tar xzfsv ' + options.releaseArchiveTargetPath() + ' && rm ' + options.releaseArchiveTargetPath(), function (err) {
                    return cb(err);
                });
            };

            var npmInstall = function (cb) {
                grunt.log.subhead('Install dependencies');
                operations.exec(grunt, connection, 'cd ' + options.currentReleasePath() + ' && ' + options.npmBinary + ' install ' + options.npmInstallOptions, function (err) {
                    return cb(err);
                });
            };

            var createSymlink = function (cb) {
                grunt.log.subhead('Create symlink');
                operations.exec(grunt, connection, 'ln -sf ' + options.currentReleasePath() + ' ' + options.currentLinkPath(), function (err) {
                    return cb(err);
                });
            };

            var writeUpstart = function (cb) {
                grunt.log.subhead('Creating upstart script');
                operations.write(grunt, connection, upstartGen(options), options.upstartScriptPath(), function (error) {
                    return cb(error);
                });
            };

            var removeUpstart = function (cb) {
                grunt.log.subhead('Removing upstart script');
                operations.exec(grunt, connection, 'rm ' + options.upstartScriptPath(), function (err) {
                    return cb(err);
                });
            };

            var cleanDeployment = function (cb) {
                grunt.log.subhead('Removing deployment');
                operations.exec(grunt, connection, 'rm -Rf ' + options.applicationPath(), function (err) {
                    return cb(err);
                });
            };

            var stopApp = function (cb) {
                grunt.log.subhead('Stopping application (if running)');
                operations.exec(grunt, connection, 'stop ' + options._jobName(), true, function (err) {
                    return cb(err);
                }, true);
            };

            var startApp = function (cb) {
                grunt.log.subhead('Starting application');
                operations.exec(grunt, connection, 'start ' + options._jobName(), function (err) {
                    return cb(err);
                });
            };

            var chooseRelease = function (cb) {
                grunt.log.subhead('Starting application');
                operations.readdir(grunt, connection, options.releasesPath(), function (err, list) {
                    if (err) {
                        return cb(err);
                    }

                    list = _.filter(list, function (item) {
                        return !_.contains(['.', '..'], item.filename);
                    });

                    var choices = _.pluck(list, 'filename');

                    inquirer.prompt([
                        {
                            type: 'list',
                            name: 'release',
                            message: 'Rollback to...?',
                            choices: choices
                        }
                    ], function (answers) {
                        // Use user feedback for... whatever!!
                        console.log(answers);

                        grunt.log.subhead('Create symlink');
                        operations.exec(grunt, connection, 'ln -sf ' + path.join(options.releasesPath(), answers.release) + ' ' + options.currentLinkPath(), function (err) {
                            return cb(err);
                        });
                    });
                });
            };

            var closeConnection = function (cb) {
                grunt.log.subhead('Closing connection');
                connection.end();
                return cb();
            };

            var tasks = [];

            if (taskArgs.undeploy || taskArgs.remove) {
                tasks.push(stopApp);
                tasks.push(removeUpstart);

                if (taskArgs.remove) {
                    tasks.push(cleanDeployment);
                }
            } else if (taskArgs.rollback) {
                tasks.push(chooseRelease);
                tasks.push(writeUpstart);
                tasks.push(stopApp);
                tasks.push(startApp);
            } else {
                tasks.push(printUptime);

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
            }

            tasks.push(closeConnection);

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
                grunt.log.subhead('Job completed');

                if (taskArgs.remove) {
                    grunt.log.ok('Deployment removal completed!');
                } else if (taskArgs.undeploy) {
                    grunt.log.ok('Undeploy completed!');
                } else if (taskArgs.rollback) {
                    grunt.log.ok('Rollback completed!');
                } else {
                    grunt.log.ok('Deployment completed!');
                }

                done();
            }
        );
    });
};
