## What changed 修改内容

<!-- What a user or contributor would notice, in plain words. 用平实的语言描述用户或贡献者能感受到的变化。 -->

## Why 原因

<!-- The problem this solves. Link the issue if there is one, e.g. "Closes #123". 说明要解决的问题，如有相关 issue 请关联，例如 "Closes #123"。 -->

## How it was tested 测试方式

<!-- What you ran and what you checked by hand. Add screenshots for anything visible in the app. 说明你运行了什么、手动检查了什么；界面上可见的修改请附截图。 -->

## Checklist 自查清单

- [ ] `npx tsc --noEmit` and `npm run build` pass locally 本地类型检查与构建通过
- [ ] New interface text is in both `zh` and `en` in `src/i18n/translations.ts` 新增界面文字已同时加入 `zh` 与 `en`
- [ ] Model changes in `logic.ts` cite their source 对 `logic.ts` 模型的修改已注明来源
- [ ] Database changes are a new file in `migrations/` 数据库修改以新迁移文件的形式提交
- [ ] No health data leaves the device without the user choosing it 未经用户选择，健康数据不会离开设备
- [ ] The version number is unchanged 未修改版本号
