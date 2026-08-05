@echo off
chcp 65001 >nul
title SunTrade Order Notifier
echo ========================================
echo   SunTrade Order Notifier
echo ========================================
echo.
echo Орнатылуда / Installing dependencies...
pip install supabase -q
echo.
echo Іске қосылуда / Starting...
echo.
python order_notifier.py
pause
