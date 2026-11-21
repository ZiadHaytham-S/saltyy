import mongoose from 'mongoose';
const connection = mongoose.createConnection(
  'mongodb://127.0.0.1:27017/admin?directConnection=true',
  { serverSelectionTimeoutMS: 5000 },
);
try {
  await connection.asPromise();
  const db = connection.db;
  if (!db) throw new Error('Database unavailable');
  const hello = await db.command({ hello: 1 });
  if (hello.setName && hello.setName !== 'rs0')
    throw new Error('Existing replica set is not rs0; no changes made');
  if (hello.setName === 'rs0') {
    console.log('rs0 already initialized; no changes made.');
  } else {
    await db.command({
      replSetInitiate: {
        _id: 'rs0',
        members: [{ _id: 0, host: '127.0.0.1:27017' }],
      },
    });
    console.log('rs0 initialized. Wait for primary, then run db:check.');
  }
} catch {
  console.error(
    'Replica-set setup failed. Start mongod with --replSet rs0 first; see README.md.',
  );
  process.exitCode = 1;
} finally {
  await connection.close();
}
