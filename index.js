import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Парсинг конфигурации курсов
function parseCourses(coursesString) {
  const courses = [];
  const courseEntries = coursesString.split('|');
  
  for (const entry of courseEntries) {
    const [courseId, slotsStr] = entry.trim().split(':');
    if (courseId && slotsStr) {
      const slots = slotsStr.split(',').map(s => parseInt(s.trim()));
      courses.push({ courseId, slots });
    }
  }
  
  return courses;
}

async function registerForCourse(browser, courseId, slots, saveClicks, courseIndex, storageState, useSharedSession) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    storageState: storageState
  });
  
  const page = await context.newPage();
  
  const result = {
    courseId,
    success: false,
    selectedSlots: 0,
    alreadySelected: 0,
    error: null
  };
  
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📚 [Поток ${courseIndex + 1}] КУРС: ${courseId}`);
    console.log(`🎯 Слоты для регистрации: ${slots.join(', ')}`);
    console.log(`${'='.repeat(60)}\n`);

    // Переход на страницу курса
    const studentId = process.env.STUDENT_ID || '35519';
    const baseUrl = `https://wsp2.kbtu.kz/registration/student/${studentId}/schedule`;
    const courseUrl = `${baseUrl}/${courseId}`;
    
    if (!useSharedSession) {
      // Отдельная авторизация для каждого курса
      console.log(`🔐 [${courseId}] Авторизация...`);
      await page.goto('https://wsp2.kbtu.kz', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      const loginButton = await page.locator('a:has-text("Вход"), button:has-text("Вход"), a:has-text("Войти"), button:has-text("Войти"), a:has-text("Login"), button:has-text("Login")').first();
      await loginButton.click();
      await page.waitForTimeout(500);

      const loginSelector = 'input[name="login"], input[name="username"], input[name="user"], input[id="login"], input[id="username"], input[type="text"]';
      const passwordSelector = 'input[name="password"], input[type="password"]';
      
      await page.waitForSelector(loginSelector, { timeout: 10000 });
      await page.fill(loginSelector, process.env.KBTU_LOGIN);
      await page.fill(passwordSelector, process.env.KBTU_PASSWORD);
      await page.waitForTimeout(200);

      await page.locator('button:has-text("Вход"), button:has-text("Войти"), input[type="submit"], button[type="submit"]').first().click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);
      console.log(`✅ [${courseId}] Авторизация успешна`);
    } else {
      console.log(`🔐 [${courseId}] Использую готовую авторизацию...`);
    }
    
    await page.goto(courseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Получаем все слоты
    await page.waitForSelector('.schedule-row', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);
    const scheduleRows = await page.locator('.schedule-row').all();
    console.log(`📋 [${courseId}] Найдено ${scheduleRows.length} слотов\n`);

    let selectedCount = 0;
    let alreadySelectedCount = 0;

    // Выбираем нужные слоты
    for (let i = 0; i < scheduleRows.length; i++) {
      const slotNumber = i + 1;
      
      if (slots.includes(slotNumber)) {
        const row = scheduleRows[i];
        
        try {
          const checkbox = row.locator('input[type="checkbox"]').first();
          const isChecked = await checkbox.isChecked().catch(() => false);
          
          const lessonType = await row.locator('.schedule-cell.lesson .schedule-cell-wrap').textContent().catch(() => 'N/A');
          const teacher = await row.locator('.schedule-cell.teacher .schedule-cell-wrap').textContent().catch(() => 'N/A');
          const weekDay = await row.locator('.schedule-cell.week-day .schedule-cell-wrap').textContent().catch(() => 'N/A');
          const time = await row.locator('.schedule-cell.time .schedule-cell-wrap').textContent().catch(() => 'N/A');

          if (!isChecked) {
            const label = row.locator('label.el-checkbox').first();
            await label.click();
            await page.waitForTimeout(100);
            selectedCount++;
            console.log(`✅ [${courseId}] Слот #${slotNumber}: ${lessonType.trim()} | ${teacher.trim()} | ${weekDay.trim()} ${time.trim()}`);
          } else {
            alreadySelectedCount++;
            console.log(`ℹ️  [${courseId}] Слот #${slotNumber}: ${lessonType.trim()} | ${teacher.trim()} | ${weekDay.trim()} ${time.trim()} (уже выбран)`);
          }
        } catch (e) {
          console.log(`❌ [${courseId}] Ошибка при выборе слота #${slotNumber}: ${e.message}`);
        }
      }
    }

    console.log(`\n📊 [${courseId}] Итого: выбрано ${selectedCount}, уже было выбрано ${alreadySelectedCount}\n`);

    result.selectedSlots = selectedCount;
    result.alreadySelected = alreadySelectedCount;

    // Сохранение
    const saveButton = page.locator('.schedule-menu-right button.el-button').first();
    await saveButton.waitFor({ state: 'attached', timeout: 15000 });

    let enabledClicks = 0;
    let disabledClicks = 0;

    console.log(`💾 [${courseId}] Нажимаем кнопку "Сохранить" ${saveClicks} раз...\n`);

    for (let i = 1; i <= saveClicks; i++) {
      try {
        const isDisabled = await page.evaluate(() => {
          const btn = document.querySelector('.schedule-menu-right button.el-button');
          return btn ? btn.disabled : true;
        });

        await saveButton.click({ force: true });
        
        if (isDisabled) {
          disabledClicks++;
          console.log(`  [${courseId}] ${i}. Клик (DISABLED)`);
        } else {
          enabledClicks++;
          console.log(`  [${courseId}] ${i}. Клик (ENABLED)`);
        }

        await page.waitForTimeout(300);
      } catch (e) {
        console.log(`  [${courseId}] ${i}. Ошибка: ${e.message}`);
      }
    }

    console.log(`\n📈 [${courseId}] Статистика кликов: ENABLED = ${enabledClicks}, DISABLED = ${disabledClicks}\n`);

    // Создаем скриншот если включено
    if (process.env.SCREENSHOTS === 'true') {
      const screenshotDir = path.join(process.cwd(), 'screenshots', courseId);
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const screenshotPath = path.join(screenshotDir, `success_${timestamp}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`📸 [${courseId}] Скриншот сохранен: ${screenshotPath}`);
    }

    console.log(`\n✅ [${courseId}] Регистрация завершена!`);
    result.success = true;
    
  } catch (error) {
    console.error(`\n❌ [${courseId}] Ошибка:`, error.message);
    result.error = error.message;
    
    try {
      const errorDir = path.join(process.cwd(), 'screenshots', 'errors');
      if (!fs.existsSync(errorDir)) {
        fs.mkdirSync(errorDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      await page.screenshot({ path: path.join(errorDir, `error_${courseId}_${timestamp}.png`) });
    } catch (e) {
      // Игнорируем
    }
  } finally {
    if (process.env.HEADLESS === 'true') {
      await context.close();
    }
  }
  
  return result;
}

async function login(browser) {
  console.log('🔐 Выполняю авторизацию...');
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  
  try {
    await page.goto('https://wsp2.kbtu.kz', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);

    const loginButton = await page.locator('a:has-text("Вход"), button:has-text("Вход"), a:has-text("Войти"), button:has-text("Войти"), a:has-text("Login"), button:has-text("Login")').first();
    await loginButton.click();
    await page.waitForTimeout(500);

    const loginSelector = 'input[name="login"], input[name="username"], input[name="user"], input[id="login"], input[id="username"], input[type="text"]';
    const passwordSelector = 'input[name="password"], input[type="password"]';
    
    await page.waitForSelector(loginSelector, { timeout: 10000 });
    await page.fill(loginSelector, process.env.KBTU_LOGIN);
    await page.fill(passwordSelector, process.env.KBTU_PASSWORD);
    await page.waitForTimeout(200);

    await page.locator('button:has-text("Вход"), button:has-text("Войти"), input[type="submit"], button[type="submit"]').first().click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Получаем полное состояние (cookies + localStorage)
    const storageState = await context.storageState();
    console.log('✅ Авторизация успешна, состояние сохранено\n');
    
    await context.close();
    return storageState;
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function main() {
  console.log('🚀 Запуск автоматической регистрации на курсы KBTU\n');

  const coursesString = process.env.COURSES;
  if (!coursesString) {
    console.error('❌ Не найдена переменная окружения COURSES');
    return;
  }

  const courses = parseCourses(coursesString);
  
  console.log(`📚 Курсов для регистрации: ${courses.length}`);
  courses.forEach(c => console.log(`   - Курс ${c.courseId}: слоты ${c.slots.join(', ')}`));
  console.log(`\n⚡ Запуск ${courses.length} параллельных потоков...\n`);

  const browser = await chromium.launch({
    headless: process.env.HEADLESS === 'true'
  });

  try {
    const useSharedSession = process.env.SHARED_SESSION !== 'false';
    let storageState = null;
    
    if (useSharedSession) {
      // Авторизуемся один раз и получаем storageState
      console.log('🔄 Режим: Общая сессия для всех курсов\n');
      storageState = await login(browser);
    } else {
      console.log('🔄 Режим: Отдельный вход для каждого курса\n');
    }
    
    const saveClicks = parseInt(process.env.SAVE_CLICKS) || 10;
    
    // Запускаем регистрацию на все курсы параллельно
    const registrationPromises = courses.map((course, index) => 
      registerForCourse(browser, course.courseId, course.slots, saveClicks, index, storageState, useSharedSession)
    );
    
    const results = await Promise.all(registrationPromises);

    console.log('\n' + '='.repeat(60));
    console.log('🎉 ВСЕ КУРСЫ ОБРАБОТАНЫ!');
    console.log('='.repeat(60));
    
    // Сводка
    console.log('\n📊 СВОДКА ПО КУРСАМ:\n');
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    if (successful.length > 0) {
      console.log('✅ УСПЕШНО:');
      successful.forEach(r => {
        console.log(`   - Курс ${r.courseId}: выбрано ${r.selectedSlots} слотов, уже было ${r.alreadySelected}`);
      });
    }
    
    if (failed.length > 0) {
      console.log('\n❌ С ОШИБКАМИ:');
      failed.forEach(r => {
        console.log(`   - Курс ${r.courseId}: ${r.error}`);
      });
    }
    
    console.log(`\n📈 ИТОГО: ${successful.length} успешно, ${failed.length} ошибок из ${results.length} курсов\n`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Произошла критическая ошибка:', error.message);
  } finally {
    if (process.env.HEADLESS === 'true') {
      await browser.close();
    } else {
      console.log('\n💡 Браузер оставлен открытым (HEADLESS=false)');
    }
    console.log('\n🏁 Завершено');
  }
}

main().catch(console.error);
