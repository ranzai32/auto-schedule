# Auto-Schedule KBTU

Автоматическая регистрация на курсы KBTU

## Установка

**Шаг 1:** Установите зависимости
```bash
npm install
npx playwright install chromium
```

**Шаг 2:** Настройте файл `.env`
```env
KBTU_LOGIN=ваш_логин
KBTU_PASSWORD=ваш_пароль
STUDENT_ID=35519
COURSES=94610:10,11,12
SAVE_CLICKS=10
HEADLESS=true
```

**Шаг 3:** Запустите
```bash
npm start
```

## Формат COURSES

Для нескольких курсов используйте `|`:
```
COURSES=94610:10,11,12|94611:1,2,3|94612:4,5
```

Формат: `ID_курса:номера_слотов`
