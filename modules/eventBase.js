const EventEmitter = require('events');
class EventBaseEvent extends EventEmitter {}

module.exports = 
{
    eventBaseEvent: new EventBaseEvent(),
    init: async (ws) => {
        ws.on('message', async data => {
            let type = data.type;
            if (type) {
                eventBaseEvent.emit(type, data);
            } else {
                console.error(`[!]: Received message from server, but it did not contain a type value (Likely nonsensical data)`);
            }
        });
    }
}
