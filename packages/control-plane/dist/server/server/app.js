"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const config_1 = __importDefault(require("../routes/config"));
const mutation_1 = __importDefault(require("../routes/mutation"));
const health_1 = __importDefault(require("../routes/health"));
const runs_1 = __importDefault(require("../routes/runs"));
const audit_1 = __importDefault(require("../routes/audit"));
const auth_1 = require("../middleware/auth");
const app = (0, express_1.default)();
exports.app = app;
app.set('x-powered-by', false);
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'X-API-Key'],
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(auth_1.authMiddleware);
app.use('/api/config', config_1.default);
app.use('/api/mutation', mutation_1.default);
app.use('/api/health', health_1.default);
app.use('/api/runs', runs_1.default);
app.use('/api/audit', audit_1.default);
app.use(express_1.default.static(path_1.default.join(__dirname, '..', '..', 'client')));
app.get('*', (_req, res) => {
    res.sendFile(path_1.default.join(__dirname, '..', '..', 'client', 'index.html'));
});
//# sourceMappingURL=app.js.map