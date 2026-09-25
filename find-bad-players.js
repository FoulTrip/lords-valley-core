const { MongoClient } = require('mongodb');
const url = process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/"/g,'') : 'mongodb+srv://vectorsovereign_db_user:Yv599gBtvABBVcId@vector.yoqp6xa.mongodb.net/lordsvalley-development';
async function run() {
  const client = new MongoClient(url);
  try {
    await client.connect();
    const db = client.db('lordsvalley-development');
    const players = db.collection('Player');
    const bad = await players.find({ _id: '__health__' }).toArray();
    console.log('Players with _id "__health__":', bad.length);
    const all = await players.find().toArray();
    console.log('Total players:', all.length);
    console.log(all.map(p => ({ id: p._id.toString(), username: p.username })));
  } finally {
    await client.close();
  }
}
run().catch(console.error);
