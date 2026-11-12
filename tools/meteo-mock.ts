/**
 * Заглушка внешней метеорологической службы космодрома (не входит в систему, изображает внешний API).
 *   npm run meteo-mock                      — режим calm на порту 3100
 *   METEO_MOCK_MODE=storm npm run meteo-mock
 * Режим можно переключить на ходу: curl -X POST http://localhost:3100/mode/slow
 *   calm    — погода в пределах
 *   storm   — ветер на высотах 31 м/с и гроза
 *   slow    — отвечает через 15 с (дольше таймаута системы)
 *   error   — HTTP 503
 *   garbage — ответ не по формату
 */
import http from 'node:http';

const MODES = ['calm', 'storm', 'slow', 'error', 'garbage'] as const;
type Mode = (typeof MODES)[number];
let mode: Mode = (MODES as readonly string[]).includes(process.env.METEO_MOCK_MODE ?? '') ? (process.env.METEO_MOCK_MODE as Mode) : 'calm';
const PORT = Number(process.env.METEO_MOCK_PORT ?? 3100);

function forecast(stormy: boolean) {
  return {
    issuedAt: new Date().toISOString(),
    levels: [
      { altitudeM: 0, windMs: stormy ? 11 : 6, temperatureC: 3 },
      { altitudeM: 1000, windMs: stormy ? 17 : 10, temperatureC: -2 },
      { altitudeM: 5000, windMs: stormy ? 26 : 15, temperatureC: -24 },
      { altitudeM: 10000, windMs: stormy ? 31 : 19, temperatureC: -50 },
    ],
    cloudiness: stormy ? 9 : 4,
    thunderstorm: stormy,
  };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const json = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'POST' && url.pathname.startsWith('/mode/')) {
    const next = url.pathname.slice('/mode/'.length);
    if (!(MODES as readonly string[]).includes(next)) return json(400, { error: `режимы: ${MODES.join(', ')}` });
    mode = next as Mode;
    console.log(`режим: ${mode}`);
    return json(200, { mode });
  }
  if (req.method !== 'GET' || url.pathname !== '/forecast') return json(404, { error: 'not found' });

  console.log(`${new Date().toLocaleTimeString()} запрос прогноза: площадка «${url.searchParams.get('pad')}», окно ${url.searchParams.get('at')} → ${mode}`);
  switch (mode) {
    case 'calm': return json(200, forecast(false));
    case 'storm': return json(200, forecast(true));
    case 'slow': setTimeout(() => json(200, forecast(false)), 15_000); return;
    case 'error': return json(503, { error: 'service unavailable' });
    case 'garbage': return json(200, { wind: 'сильный' });
  }
});

server.listen(PORT, () => console.log(`Заглушка метеослужбы: http://localhost:${PORT}/forecast (режим ${mode})`));
