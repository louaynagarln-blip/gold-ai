package com.aigoldtrader.demo
import android.app.Activity
import android.os.Bundle
import android.widget.*
// Local non-broker fixture used only to exercise Accessibility in emulator tests.
class ScreenFixtureActivity : Activity() {
 override fun onCreate(savedInstanceState:Bundle?) {
  super.onCreate(savedInstanceState)
  val panel=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL }
  panel.addView(TextView(this).apply { text="LOCAL TEST FIXTURE — NO TRADING" })
  val field=EditText(this).apply { id=R.id.fixture_volume;setText("1.00");inputType=8194 }
  val result=TextView(this).apply { id=R.id.fixture_result;text="UNCHANGED" }
  panel.addView(field)
  panel.addView(Button(this).apply { id=R.id.fixture_apply;text="APPLY TEST VALUE";setOnClickListener { result.text="APPLIED: ${field.text}" } })
  panel.addView(result);setContentView(panel)
 }
}
