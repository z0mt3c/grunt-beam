module.exports = {
    remove: {
        complete: 'Deployment removal completed!',
        type: 'Undeploy',
        ready: 'Ready to undeploy and remove all related files from server (or skip this server)?'
    },

    deploy: {
        complete: 'Deployment completed',
        type: 'Deploy',
        ready: 'Ready to start deployment (or skip this server)?'
    },

    undeploy: {
        complete: 'Undeploy completed!',
        type: 'Undeploy',
        ready: 'Ready to undeploy (or skip this server)?'
    },

    rollback: {
        complete: 'Rollback completed!',
        type: 'Rollback',
        ready: 'Ready to rollback release (or skip this server)?'
    },

    clean: {
        complete: 'Cleaning completed!',
        type: 'Clean releases',
        ready: 'Ready to clean release (or skip this server)?'
    },

    restart: {
        complete: 'Restart completed!',
        type: 'Restart',
        ready: 'Ready to restart application (or skip this server)?'
    },

    uptime: {
        complete: 'Uptime printed!',
        type: 'Uptime',
        ready: 'Ready to check the uptime (or skip this server)?'
    },

    log: {
        complete: 'Log printing completed!',
        type: 'Log',
        ready: 'Ready to check log (or skip this server)?'
    }
};