# grunt-beam
Yet another capistrano-less deployment flow for node.js applications with grunt.

But attention: i would not consider it to be stable ;-) There are no tests and it's lacking a proper documentation for now, sorry!

[![Dependency Status](https://gemnasium.com/z0mt3c/grunt-beam.png)](https://gemnasium.com/z0mt3c/grunt-beam)

## Configuration
Simple example configuration with two servers:

```js
beam: {
    stage: {
        servers: [
            {
                host: 'server1.domain.tld',
                enterCredentials: true
            },
            {
                host: 'server1.domain.tld'
            },
            {
                host: 'xxx.xxx.xxx.xxx',
                enterCredentials: false,
                username: 'xxxx',
                privateKey: './id_rsa',
                passphrase: 'xxxxxx'
            }
        ],
        nodeUser: 'root',
        nodeEnv: 'production',
        targetPath: '/root/apps',
        releaseArchive: 'out/<%= packageInfo.name %>-<%= packageInfo.version %>.tar.gz'
    }
}
```

### Further configuration parameters
...and its current default options:

```js
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
    releaseName: packageInfo.name+'-'+packageInfo.version,
    nodeUser: '',
    nodeEnv: '',
    nodeEnvExtras: '',
    nodeBinary: 'node',
    npmBinary: 'npm',
    npmInstallOptions: '--production',
    appCommand: packageInfo.main || 'index.js',
};
```

## Supported commands

```bash
Usage:          grunt beam:<group>

Possible parameters:
--redeploy      Normal deployment but cleans target directory before
--undeploy      Will undeploy your node application. That means: stopping the application and remove all files which belong to the release. (Attention includes default log-path)
--remove        Undeploys and removes all application data
--rollback      Lets you choose a release from the server which has been deployed before
--clean         Lets you choose which old releases should be removed from the server
--restart       Restarts the application on the configured servers
--uptime        Prints the uptime on the configured servers
--log           Prints the last 20 lines of std and err log
```







