
var jenkins_api = require('jenkins-api');
var config = require("../config.jenkins");
var moment = require('moment');
var JenkinsAPI;

var init = function() {

    JenkinsAPI = jenkins_api.init(config.protocol + '://' + config.username + ':' + config.token + '@' + config.host, {
        rejectUnauthorized: false
    });

    return {
        getResult: function(data) {
            if (data['result'] == undefined || data['result'] == null) {
                return 'running';
            }

            return data['result'].toLowerCase();
        },

        parameterizedParameterValue: function(actions, parameterName) {
            var result = '';
            actions.forEach(function(action) {
                if (action['parameters'] === undefined) return;
                action['parameters'].forEach(function(parameter) {
                    if(parameter['name'] != parameterName) {
                        return;
                    }
                    result = parameter['value'];
                });
            });
            return result;
        },

        lastTimeOfExecution: function(timestamp) {
            var now = moment(moment().toDate().getTime());
            var lastBuildDate = moment(timestamp).utc();
            return lastBuildDate.from(now);
        }
    }
};

var JenkinsService = init();
var cronJob = require('cron').CronJob;

config.jobs.forEach(function(job) {
    new cronJob(job.cronInterval, function(){
        JenkinsAPI[job.apiMethod](job.id, function(error, data) {
            if (error) return console.log(error);
            var eventArguments = {
                loadCoffeeScript: true,
                title: job.displayName,
                buildNumber: data['id'],
                result: JenkinsService.getResult(data),
                building: data['building'],
                timeAgo: JenkinsService.lastTimeOfExecution(data['timestamp']),
                duration: data['duration'],
                estimatedDuration: data['estimatedDuration'],
                displayDuration: moment(data['duration']).utc().format('HH:mm:ss'),
                displayEstimatedDuration: moment(data['estimatedDuration']).utc().format('HH:mm:ss')
            };

            if (job.overwriteArguments != undefined && job.overwriteArguments.length > 0) {
                job.overwriteArguments.forEach(function(overwriteArgument) {
                    var argumentName = overwriteArgument.targetArgumentName;
                    delete eventArguments[argumentName];
                    JenkinsAPI.last_build_info(overwriteArgument.sourceJobId, function(error, data) {
                        if (error) return console.log(error);
                        var sourceArgumentName = overwriteArgument.sourceArgumentName;
                        var targetArgumentValue = data[sourceArgumentName];
                        var overwriteEventArguments = {};
                        overwriteEventArguments[argumentName] = targetArgumentValue;
                        send_event(job.eventName, overwriteEventArguments);
                    });
                });
            }

            if (job.parameterizedAttributes != undefined && job.parameterizedAttributes.length > 0) {
                job.parameterizedAttributes.forEach(function(parameter) {
                    var argumentName = parameter.attributeName;
                    var argumentValue = JenkinsService.parameterizedParameterValue(data['actions'], parameter.jenkinsParameterName);
                    eventArguments[argumentName] = argumentValue;
                });
            }

            eventArguments.title_isEnabled = job.displayArguments.title_isEnabled;
            eventArguments.buildNumber_isEnabled = job.displayArguments.buildNumber_isEnabled;
            eventArguments.timeAgo_isEnabled = job.displayArguments.timeAgo_isEnabled;
            eventArguments.branch_isEnabled = job.displayArguments.branch_isEnabled;
            eventArguments.displayDuration_isEnabled = job.displayArguments.displayDuration_isEnabled;

            send_event(job.eventName, eventArguments);
        });
    }, null, true, null);

    setInterval(function() {}, 5000);
});
