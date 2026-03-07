import Retell from 'retell-sdk';

// Singleton Retell client — reused across server-side calls
export const retell = new Retell({
  apiKey: process.env.RETELL_API_KEY ?? '',
});
