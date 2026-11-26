import Waiting from './Waiting';

/** A page whose code is still on its way: the waiting rail across the column. */
const PageLoading = () => (
    <div className="flex-1 flex items-center justify-center p-8">
        <Waiting wide className="w-full max-w-xs" />
    </div>
);

export default PageLoading;
