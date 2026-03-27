const timeUtils = {
    now: (): number => Date.now(),
    newDate: (timestamp?: number): Date => timestamp ? new Date(timestamp) : new Date()
};

export default timeUtils;
