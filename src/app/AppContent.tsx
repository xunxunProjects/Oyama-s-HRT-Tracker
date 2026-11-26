import AppViews from './AppViews';
import { useAppShell } from './useAppShell';

const AppContent = () => {
    const shell = useAppShell();
    return <AppViews shell={shell} />;
};

export default AppContent;
