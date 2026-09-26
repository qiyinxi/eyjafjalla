@echo off
chcp 65001 >nul
title 艾雅法拉展示页 · 25568
cd /d "%~dp0"
python serve.py --port 25568
pause
