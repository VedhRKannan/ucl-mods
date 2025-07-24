import admin from 'firebase-admin'
import path from 'path'
import fs from 'fs'

const serviceAccount = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'firebaseServiceAccount.json'), 'utf8')
)

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount)
  })
}

const db = admin.firestore()
export { db }
