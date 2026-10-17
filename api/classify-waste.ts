import app from '../server.ts';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req: any, res: any) {
  if (!req.url || !req.url.startsWith('/api')) {
    req.url = '/api/classify-waste';
  }
  return app(req, res);
}
