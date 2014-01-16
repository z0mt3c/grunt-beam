'use strict';

module.exports = function (grunt) {
    var path = require('path');
    var fs = require('fs');
    var inquirer = require('inquirer');
    var async = require('async');
    var Connection = require('ssh2');
    var _ = require('underscore');
    var upstartGen = require('./upstart/upstartScriptGenerator');
    var operations = require('./operations');
    var packageInfo = grunt.file.readJSON('package.json');
    var messages = require('./messages');

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
        nodeUser: 'nodejs',
        nodeEnv: 'production',
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
            return this.jobName || 'node-' + this.appName + '-' + this.nodeEnv;
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
        if (!group) {
            grunt.log.writeln('Usage:          grunt beam:<group>');
            grunt.log.writeln('');
            grunt.log.writeln('Possible parameters:');
            grunt.log.writeln('--redeploy      Normal deployment but cleans target directory before');
            grunt.log.writeln('--undeploy      Undeploys your application (stop & remove upstart script)');
            grunt.log.writeln('--remove        Undeploys and removes all application data');
            grunt.log.writeln('--rollback      Lets you choose a release from the server which has been deployed before');
            grunt.log.writeln('--clean         Lets you choose which old releases should be removed from the server');
            grunt.log.writeln('--restart       Restarts the application on the configured servers');
            grunt.log.writeln('--uptime        Prints the uptime on the configured servers');
            grunt.log.writeln('--log           Prints the last 20 lines of std and err log');
            grunt.log.writeln('');

            grunt.fail.fatal('No configuration target defined. Please run grunt beam:<group>');
        }

        // rough config check
        grunt.config.requires('beam.' + group + '.servers');
        grunt.config.requires('beam.' + group + '.releaseArchive');
        grunt.config.requires('beam.' + group + '.targetPath');

        var self = this,
            done = self.async();


        var mode;

        if (grunt.option('undeploy') === true) {
            mode = 'undeploy';
        } else if (grunt.option('remove') === true) {
            mode = 'remove';
        } else if (grunt.option('redeploy') === true) {
            mode = 'redeploy';
        } else if (grunt.option('clean') === true) {
            mode = 'clean';
        } else if (grunt.option('rollback') === true) {
            mode = 'rollback';
        } else if (grunt.option('restart') === true) {
            mode = 'restart';
        } else if (grunt.option('log') === true) {
            mode = 'log';
        } else if (grunt.option('uptime') === true) {
            mode = 'uptime';
        } else {
            mode = 'deploy';
        }

        var options = _.extend({}, beamDefaultOptions, grunt.config.get('beam.' + group));
        var lastRollbackRelease = null;

        grunt.log.writeln('Preparing deployment on target: ' + group + ' with a total of ' + options.servers.length + ' server(s)');

        var connect = function (cb, completed) {
            var i = 0;

            async.eachSeries(options.servers, function (oServer, next) {
                var server = _.extend({}, beamDefaultServerOptions, oServer);

                var readyMsg = messages[mode].ready;
                var type = messages[mode].type;

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
                        default: server.username,
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

                        if (server.privateKey) {
                            server.privateKey = fs.readFileSync(server.privateKey);
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

            var cleanCurrentReleaseFolder = function (cb) {
                grunt.log.subhead('Cleaning release directory');
                operations.exec(grunt, connection, 'rm -Rf ' + options.currentReleasePath() + '/*', function (err) {
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
                operations.exec(grunt, connection, 'ln -snf ' + options.currentReleasePath() + ' ' + options.currentLinkPath(), function (err) {
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

            var setPermissions = function (cb) {
                grunt.log.subhead('Setting file owner');
                operations.exec(grunt, connection, 'chown -Rf ' + options.nodeUser + ' ' + options.applicationPath(), function (err) {
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

            var logTail = function (cb) {
                grunt.log.subhead('Log (Error)');
                setTimeout(function () {
                    operations.exec(grunt, connection, 'tail -n 20 ' + options.logFilePathSymErr(), true, function (err1) {
                        grunt.log.subhead('Log (Std)');
                        operations.exec(grunt, connection, 'tail -n 20 ' + options.logFilePathSymStd(), true, function (err2) {
                            return cb(err1 || err2);
                        });
                    });
                }, 1500);
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

                    var defaultChoiceIndex = null;

                    if (lastRollbackRelease && list.indexOf(lastRollbackRelease) !== -1) {
                        defaultChoiceIndex = list.indexOf(lastRollbackRelease);
                    }

                    var choices = _.pluck(list, 'filename');

                    inquirer.prompt([
                        {
                            type: 'list',
                            name: 'release',
                            message: 'Rollback to...?',
                            choices: choices,
                            default: defaultChoiceIndex
                        }
                    ], function (answers) {
                        lastRollbackRelease = answers.release;

                        grunt.log.subhead('Create symlink');
                        operations.exec(grunt, connection, 'ln -snf ' + path.join(options.releasesPath(), answers.release) + ' ' + options.currentLinkPath(), function (err) {
                            return cb(err);
                        });
                    });
                });
            };

            var chooseReleases = function (cb) {
                grunt.log.subhead('Starting application');
                operations.readdir(grunt, connection, options.releasesPath(), function (err, list) {
                    if (err) {
                        return cb(err);
                    }

                    list = _.filter(list, function (item) {
                        return !_.contains(['.', '..'], item.filename);
                    });

                    var choices = _.map(list, function (item) {
                        return {
                            name: item.filename,
                            checked: false
                        };
                    });

                    inquirer.prompt([
                        {
                            type: 'checkbox',
                            name: 'release',
                            message: 'Choose release which should be removed from the server?',
                            choices: choices
                        }
                    ], function (answers) {
                        if (answers && answers.release && answers.release.length > 0) {
                            var rmCmd = 'rm -Rf ' + (_.map(answers.release,function (name) {
                                return path.join(options.releasesPath(), name);
                            }).join(' '));

                            operations.exec(grunt, connection, rmCmd, function (err) {
                                return cb(err);
                            });
                        } else {
                            grunt.log.ok('Nothing to clean.');
                            return cb();
                        }
                    });
                });
            };

            var closeConnection = function (cb) {
                grunt.log.subhead('Closing connection');
                connection.end();
                return cb();
            };

            var tasks = [];

            if (mode === 'undeploy' || mode === 'remove') {
                tasks.push(stopApp);
                tasks.push(removeUpstart);

                if (mode === 'remove') {
                    tasks.push(cleanDeployment);
                }
            } else if (mode === 'rollback') {
                tasks.push(chooseRelease);
                tasks.push(writeUpstart);
                tasks.push(setPermissions);
                tasks.push(stopApp);
                tasks.push(startApp);
                tasks.push(logTail);
            } else if (mode === 'clean') {
                tasks.push(chooseReleases);
            } else if (mode === 'restart') {
                tasks.push(stopApp);
                tasks.push(startApp);
                tasks.push(logTail);
            } else if (mode === 'uptime') {
                tasks.push(printUptime);
            } else if (mode === 'log') {
                tasks.push(logTail);
            } else {
                tasks.push(printUptime);

                if (options.nodeVersion) {
                    tasks.push(checkNodeVersion);
                }

                tasks.push(prepareDirectories);

                if (mode === 'redeploy') {
                    tasks.push(cleanCurrentReleaseFolder);
                }

                tasks.push(uploadRelease);
                tasks.push(extractRelease);
                tasks.push(createSymlink);
                tasks.push(npmInstall);
                tasks.push(writeUpstart);
                tasks.push(setPermissions);
                tasks.push(stopApp);
                tasks.push(startApp);
                tasks.push(logTail);
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
                grunt.log.ok(messages[mode].complete);

                done();
            }
        );
    });
};
