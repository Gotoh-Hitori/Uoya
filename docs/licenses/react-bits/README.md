# React Bits 来源与适配

上游：[DavidHDev/react-bits](https://github.com/DavidHDev/react-bits)，作者 David Haz，Copyright (c) 2026。许可原文保留于 LICENSE.md，为 MIT + Commons Clause，并非无附加条件的 MIT；作为本应用的一部分使用，不能将上游组件或适配版本本身单独销售、转许可或再分发为组件包。项目自有代码的 GPL-3.0-only 不替代此许可；附加限制与 GPL 的兼容性需单独审查，不能将该组件标为 GPL。

本项目 public/ui/react-bits-adapter.js 为 SpotlightCard 交互的轻量 DOM 适配：保留指针/键盘焦点驱动的柔光思路，改用本项目浅蓝配色、事件委托、仅在输入发生时更新一帧，并尊重减少动态效果偏好。public/ui/uoya-surface.css 提供配套光层及 Uoya 自有的统一浅色样式。没有添加 React/GSAP/动画运行库，不创建额外 WebGL 背景。

参照源文件：
- https://github.com/DavidHDev/react-bits/blob/main/src/content/Components/SpotlightCard/SpotlightCard.jsx
- https://github.com/DavidHDev/react-bits/blob/main/src/content/Components/SpotlightCard/SpotlightCard.css

查阅日期：2026-11-13。实际适配变更及上游出处同时记录于文件注释。
