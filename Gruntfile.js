'use strict';

module.exports = function (grunt) {
    grunt.initConfig({
        jshint: {
            all: [
                'Gruntfile.js',
                'tasks/**/*.js'
            ],
            options: {
                jshintrc: '.jshintrc'
            }
        },
        release: {
            options: {
                tagName: 'v<%= version %>'
            }
        }
        /*
        beam: {
            stage: {
                servers: [
                    {
                        host: 'server1.domain.tld',
                        enterCredentials: true
                    },
                    {
                        host: 'server1.domain.tld'
                    }
                ],
                nodeUser: 'root',
                nodeEnv: 'production',
                targetPath: '/root/apps',
                releaseArchive: 'out/test.tar.gz'
            }
        }
        */
    });

    grunt.loadTasks('tasks');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.registerTask('default', ['jshint']);
};
