import app from '../server.ts';

export default async function handler(req: any, res: any) {
  if (req.url === '/' || req.url === '/api' || req.url === '') {
    return res.status(200).json({
      status: 'ok',
      service: 'SmartWaste EcoSort AI API',
      version: '1.0.0',
      time: new Date().toISOString(),
    });
  }
  return app(req, res);
}
