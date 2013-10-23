#!upstart
description "<%= appName %> (node.js-app): <%= packageInfo.description %>"
author      "grunt-beam"

start on runlevel [2345]
stop on shutdown

respawn
respawn limit 99 5

script
    cd <%= currentLinkPath() %> && exec sudo -u <%= nodeUser %> NODE_ENV=<%= nodeEnv %> <%= nodeEnvExtras %> <%= nodeBinary %> <%= appCommandPathSym() %> 2>> <%= logFilePathSymErr() %> 1>> <%= logFilePathSymStd() %>
end script