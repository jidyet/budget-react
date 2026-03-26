package com.household.budget;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Keep web content below system bars on Android devices.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
    }
}
