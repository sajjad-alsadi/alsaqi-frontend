import ws from 'k6/ws';
import { check } from 'k6';

export const options = {
  scenarios: {
    ws_stress: {
      executor: 'constant-vus',
      vus: 100,
      duration: '1m',
    },
  },
};

export default function () {
  const res = ws.connect(`${__ENV.WS_URL}/ws`, {}, function (socket) {
    socket.on('open', () => socket.send(JSON.stringify({ type: 'ping' })));
    socket.on('message', (msg) => {
      check(msg, { 'received message': (m) => m.length > 0 });
    });
    socket.setTimeout(() => socket.close(), 55000);
  });

  check(res, { 'ws connected': (r) => r && r.status === 101 });
}
