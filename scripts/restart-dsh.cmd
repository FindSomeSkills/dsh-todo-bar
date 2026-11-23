@echo off
setlocal enabledelayedexpansion
set LOG=C:\Knowledge base\02-Project\dsh-todo-bar\artifacts\restart.log

echo [%date% %time%] restart begin>> "%LOG%"

rem 计划任务里没有 stdin，timeout 会直接失败，用 ping 等
ping -n 5 127.0.0.1 >nul

set PID=
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":2081" ^| findstr "LISTENING"') do set PID=%%a
echo [%date% %time%] listener pid=!PID!>> "%LOG%"

if defined PID (
  taskkill /F /PID !PID! >> "%LOG%" 2>&1
)

ping -n 5 127.0.0.1 >nul

echo [%date% %time%] starting DSH021-Web>> "%LOG%"
schtasks /run /tn "DSH021-Web" >> "%LOG%" 2>&1

set BACK=
for /l %%i in (1,1,40) do (
  if not defined BACK (
    ping -n 3 127.0.0.1 >nul
    netstat -ano | findstr ":2081" | findstr "LISTENING" >nul && set BACK=1
  )
)

if defined BACK (
  echo [%date% %time%] port 2081 listening again>> "%LOG%"
) else (
  echo [%date% %time%] ERROR port 2081 did not return>> "%LOG%"
)

echo [%date% %time%] restart end>> "%LOG%"
schtasks /delete /tn "DSH-Restart-Once" /f >> "%LOG%" 2>&1
endlocal
