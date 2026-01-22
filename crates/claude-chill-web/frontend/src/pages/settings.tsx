import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import DirectoryInput from '@/components/DirectoryInput';
import { useConfig, useUpdateConfig } from '@/lib/api';

export default function SettingsPage() {
    const [defaultDir, setDefaultDir] = useState('');
    const navigate = useNavigate();
    
    const { data: config } = useConfig();
    const updateConfig = useUpdateConfig();

    useEffect(() => {
        if (config) setDefaultDir(config.default_directory);
    }, [config]);

    const save = () => {
        updateConfig.mutate({ default_directory: defaultDir });
    };

    return (
        <div className="flex-1 p-8 overflow-auto">
            <div className="max-w-[600px]">
                <div className="flex items-center gap-4 mb-8">
                    <button
                        onClick={() => navigate(-1)}
                        className="text-text-secondary hover:text-text-primary"
                    >
                        ← Back
                    </button>
                    <h1 className="text-xl font-semibold text-text-primary m-0">Settings</h1>
                </div>

                <div className="bg-bg-secondary rounded-lg p-6 border border-border">
                    <h2 className="text-base font-medium text-text-primary mb-4">General</h2>
                    
                    <div className="mb-4">
                        <label className="block text-text-secondary text-sm mb-2">
                            Default Directory
                        </label>
                        <DirectoryInput
                            value={defaultDir}
                            onChange={setDefaultDir}
                        />
                        <small className="block mt-1.5 text-xs text-text-muted">
                            Starting directory when creating new sessions
                        </small>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={save}
                            disabled={updateConfig.isPending}
                            className="px-4 py-2 bg-accent border-none rounded text-sm font-medium text-white cursor-pointer hover:bg-accent-hover disabled:opacity-50"
                        >
                            {updateConfig.isPending ? 'Saving...' : 'Save'}
                        </button>
                        {updateConfig.isSuccess && <span className="text-success text-sm">✓ Saved</span>}
                    </div>
                </div>
            </div>
        </div>
    );
}
