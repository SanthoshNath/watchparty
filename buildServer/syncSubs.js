"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const config_1 = __importDefault(require("./config"));
const firebase_1 = require("./utils/firebase");
const postgres_1 = require("./utils/postgres");
const stripe_1 = require("./utils/stripe");
const postgres2 = new pg_1.Client({
    connectionString: config_1.default.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});
postgres2.connect();
setInterval(syncSubscribers, 60 * 1000);
function syncSubscribers() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!config_1.default.STRIPE_SECRET_KEY || !config_1.default.FIREBASE_ADMIN_SDK_CONFIG) {
            return;
        }
        console.time('syncSubscribers');
        // Fetch subs, customers from stripe
        const [subs, customers] = yield Promise.all([
            stripe_1.getAllActiveSubscriptions(),
            stripe_1.getAllCustomers(),
        ]);
        const emailMap = new Map();
        customers.forEach((cust) => {
            emailMap.set(cust.id, cust.email);
        });
        const uidMap = new Map();
        for (let i = 0; i < subs.length; i += 50) {
            // Batch customers and fetch firebase data
            const batch = subs.slice(i, i + 50);
            const fbUsers = yield Promise.all(batch
                .map((sub) => emailMap.get(sub.customer)
                ? firebase_1.getUserByEmail(emailMap.get(sub.customer))
                : null)
                .filter(Boolean));
            fbUsers.forEach((user) => {
                uidMap.set(user === null || user === void 0 ? void 0 : user.email, user === null || user === void 0 ? void 0 : user.uid);
            });
        }
        // Create sub objects
        const result = subs.map((sub) => ({
            customerId: sub.customer,
            email: emailMap.get(sub.customer),
            status: sub.status,
            uid: uidMap.get(emailMap.get(sub.customer)),
        }));
        // Upsert to DB
        // console.log(result);
        yield (postgres2 === null || postgres2 === void 0 ? void 0 : postgres2.query('BEGIN TRANSACTION'));
        yield (postgres2 === null || postgres2 === void 0 ? void 0 : postgres2.query('DELETE FROM subscriber'));
        for (let i = 0; i < result.length; i++) {
            const row = result[i];
            yield postgres_1.insertObject(postgres2, 'subscriber', row);
        }
        yield (postgres2 === null || postgres2 === void 0 ? void 0 : postgres2.query('COMMIT'));
        console.log('%s subscribers', result.length);
        console.timeEnd('syncSubscribers');
    });
}