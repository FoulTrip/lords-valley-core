const { MongoClient } = require('mongodb');
require('dotenv').config();
const url = process.env.DATABASE_URL.replace('mongodb+srv://', 'mongodb+srv://').replace(/"/g, '');
async function run() {
  const client = new MongoClient(url);
  try {
    await client.connect();
    const db = client.db('lordsvalley-development');
    const settlements = db.collection('Settlement');
    const bad = await settlements.find({ ownerId: '__health__' }).toArray();
    console.log('Found', bad.length, 'settlements with ownerId "__health__"');
    console.log(bad.map(s => s._id.toString()));
    // Also check for ownerId as string of that value
    const stringBad = await settlements.find({ ownerId: { $type: 'string' } }).toArray();
    console.log('Settlements with ownerId as string:', stringBad.length);
    // List first few
    console.log(stringBad.slice(0,5).map(s => ({ id: s._id.toString(), ownerId: s.ownerId })));
  } finally {
    await client.close();
  }
}
run().catch(console.error);
