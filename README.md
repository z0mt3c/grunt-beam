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
grunt beam:stage
```
Will deploy your application on all servers configured in the configured <stage> group (one by one; each deployment needs to be confirmed).
That means: creating all necessary folders, uploading the configured archive-file, extracting it, creating an upstart-script and finally starting it!

```bash
grunt beam:stage --undeploy
```
Will undeploy your node application. That means: stopping the application and removing the upstart-script.

```bash
grunt beam:stage --remove
```
Will undeploy your node application. That means: stopping the application and remove all files which belong to the release. (Attention includes default log-path)

```bash
grunt beam:stage --rollback
```
Will receive all releases from the releases folder on the server, change the 'current'-symlink to the selected release and restart the application.









