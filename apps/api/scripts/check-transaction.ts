import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { environment } from '../src/config/env.js';
const connection = mongoose.createConnection(environment.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
});
try {
  await connection.asPromise();
  if (!connection.db) throw new Error('Database unavailable');
  const collection = connection.db.collection<{ _id: string; value: number }>(
    '_foundationChecks',
  );
  await collection.createIndex({ value: 1 });
  const id = randomUUID();
  try {
    await connection.transaction(async (session) => {
      await collection.insertOne({ _id: id, value: 1 }, { session });
    });
    if (!(await collection.findOne({ _id: id })))
      throw new Error('Commit failed');
    const rollbackId = randomUUID();
    try {
      await connection.transaction(async (session) => {
        await collection.insertOne({ _id: rollbackId, value: 2 }, { session });
        throw new Error('Expected rollback');
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'Expected rollback')
        throw error;
    }
    if (await collection.findOne({ _id: rollbackId }))
      throw new Error('Rollback failed');
    console.log('PASS: real MongoDB transaction commit and rollback.');
  } finally {
    await collection.deleteOne({ _id: id });
  }
} catch {
  console.error(
    'Transaction check failed. MongoDB must be running as an initialized replica set; see README.md.',
  );
  process.exitCode = 1;
} finally {
  await connection.close();
}
