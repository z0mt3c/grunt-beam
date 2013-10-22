'use strict';

module.exports = function (grunt) {
    grunt.initConfig({
        jshint: {
            all: [
                'Gruntfile.js',
                'tasks/*.js'
            ],
            options: {
                jshintrc: '.jshintrc'
            }
        },
        beam: {
            stage: {
                servers: [
                    {
                        host: 'h',
                        port: 22,
                        username: 'x',
                        password: 'y'
                    }
                ],
                appName: 'testApp',
                path: '/tmp',
                user: 'root',
                release: './package.json',
                nodeVersion: '0.10'
            }
        }
    });

    grunt.loadTasks('tasks');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-nodeunit');
    grunt.registerTask('default', ['deploy']);
};
