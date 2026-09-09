# 中文模拟面试 Agent 系统

面向业务/技术岗位训练的中文模拟面试平台：准入（授权与次数配额）、面试准备（简历 / JD / 公司 / 技术要求进上下文）、面试组织（开场 → 逐题问答与追问 → 收尾评分）、评价反馈（五维评分、逐题点评、示范答案、知识总结、口头禅统计、简历优化报告）。

项目代号 MOCK-INTERVIEW-AGENT。详见《docs/方案设计说明.md》《docs/使用说明.md》《docs/体验检查标准与过程材料.md》。

## 技术栈与结构

- `apps/server`：Node + Hono REST（3000）& WebSocket 实时面试（3000/ws）；PGlite 本地嵌入式数据库
- `apps/web`：React + Vite（5173），vite 代理 `/api` 与 `/ws` 到 3000
- `packages/shared`：域类型；`packages/data`：岗位人设 / 公司 / 技术要求种子数据
- LLM：DeepSeek（`apps/server/.env` 配置 `DEEPSEEK_API_KEY`）；无 Key 时降级 mock 不 500
- 语音：主路径 Web Speech API（浏览器 STT + 本地 TTS）；备用路径为文字对话模式（媒体被拒或识别不可用时自动切换，训练不中断）

## 启动（第三人复现步骤）

```bash
# 1. 安装依赖
npm install

# 2. 配置密钥：复制 .env.example 为 .env 并填入 DEEPSEEK_API_KEY（可选）
#    apps/server/.env

# 3. 启动后端（首次启动自动建库并运行 schema，含全部迁移）
node --env-file=apps/server/.env --import tsx apps/server/src/index.ts
#    REST:  http://localhost:3000   WS:  ws://localhost:3000/ws/interview

# 4. 启动前端
npm run dev -w apps/web        # 或 npx vite --host 127.0.0.1 -C apps/web
#    打开 http://localhost:5173
```

演示账号：`demo@test.com / secret123`（也可自行注册）。

## 演示主流程（验收闭环）

1. 注册 / 登录（首次进入自动导航到配置页）
2. 配置面试：默认「数据分析」岗位，可切换后端/前端/算法/产品；选择目标公司、技术要求（预设勾选 + 自填）、题量（固定或不限）、粘贴 JD、上传简历（PDF / Word，可选）
3. 进入面试房间：面试官开场白 → 自我介绍 → 逐题问答（基于回答实时点评 + 追问）；媒体权限被拒或浏览器不支持语音时自动进入文字输入模式，流程不受影响
4. 结束面试：说「结束对话」关键词，或点击「结束面试」按钮（不限题量模式随时可结束，随后统一评分）
5. 查看报告：综合得分、五维评分与说明、逐题点评与示范答案（可展开）、知识总结、口头禅统计、简历优化报告（可编辑并保存）

## 使用规则（准入 / 次数）

- 每位受训者每日训练配额默认 **5 场**（`users.quota_limit`），按自然日重置
- 配置页实时显示「今日剩余次数」；配额用尽后再次创建面试返回 403 并提示，明日起自动恢复
- 规则对全体用户一致，见《docs/使用说明.md》

## 数据存放与清理

- 数据库为 PGlite 本地文件，默认位置 `D:\pglite-data`（取决于运行时环境变量，见 `apps/server/src/db.ts`）
- 简历文本与会话逐字稿仅存于本库；彻底清理删除该目录即可；生产/公开展示前建议提供 `RESUME_*` 与占用说明
- 系统仅申请训练所需的最小媒体权限（麦克风、可选摄像头），拒绝时降级文字模式

## 交付物索引

| 编号 | 交付物 | 位置 |
| --- | --- | --- |
| D1 | 可演示系统（含启动方式） | 本说明 + 源码 |
| D2 | 方案设计说明 | `docs/方案设计说明.md`（附件 Q1–Q8） |
| D3 | 使用说明 | `docs/使用说明.md` |
| D4 | 过程材料 | `docs/process/`（设计演进 / 问题修复 / 阶段演示） |
| D5 | 答辩材料 | `docs/方案设计说明.md`（含答辩要点） |