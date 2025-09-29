const timeUtils = {
    now: () => Date.now(),
    newDate: (timestamp) => timestamp ? new Date(timestamp) : new Date()
};

module.exports = timeUtils;